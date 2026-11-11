from functools import cached_property
from typing import TYPE_CHECKING, Any, Literal, cast

from django.core.exceptions import ValidationError as DjangoValidationError

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.request import Request

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.api.shared import UserBasicSerializer
from posthog.models.activity_logging.model_activity import is_impersonated_session

from products.experiments.backend.activity_logging import log_variant_annotation_activity
from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_variant_annotation import ExperimentVariantAnnotation
from products.experiments.backend.variant_annotations import validate_annotation_variant_key

if TYPE_CHECKING:
    from posthog.models.user import User

MAX_ANNOTATION_LENGTH = 5000


class ExperimentVariantAnnotationSerializer(serializers.ModelSerializer):
    variant_key = serializers.CharField(
        max_length=400,
        help_text="Key of the experiment variant this note is about, e.g. 'control' or 'test'. Must be one of the experiment's feature flag variants.",
    )
    content = serializers.CharField(
        max_length=MAX_ANNOTATION_LENGTH,
        help_text="The note text, e.g. 'Shipped this variant after reviewing the results'.",
    )
    created_by = UserBasicSerializer(read_only=True, allow_null=True, help_text="User who wrote the note.")

    class Meta:
        model = ExperimentVariantAnnotation
        fields = ["id", "experiment", "variant_key", "content", "created_by", "created_at", "updated_at"]
        read_only_fields = ["id", "experiment", "created_by", "created_at", "updated_at"]
        extra_kwargs = {
            "id": {"help_text": "Unique identifier of the annotation."},
            "experiment": {"help_text": "ID of the experiment the annotation belongs to."},
            "created_at": {"help_text": "When the note was written."},
            "updated_at": {"help_text": "When the note was last changed."},
        }

    def validate_variant_key(self, value: str) -> str:
        # Notes on a variant later removed from the flag stay editable as long as the variant isn't changed.
        if self.instance is not None and value == self.instance.variant_key:
            return value
        return validate_annotation_variant_key(self.context["experiment"], value)


@extend_schema(tags=["experiments"])
class ExperimentVariantAnnotationViewSet(TeamAndOrgViewSetMixin, viewsets.ModelViewSet):
    """Notes pinned to individual variants of an experiment, kept separate from its recorded conclusion."""

    scope_object: Literal["experiment"] = "experiment"
    serializer_class = ExperimentVariantAnnotationSerializer
    # Creating a note is a write on one experiment, so per-experiment editor grants are enough; initial() checks it.
    create_checks_parent_object_access = True
    # unscoped() because a class attribute is built before any team context exists; the parent
    # lookups filter by project and safely_get_queryset narrows to the access-checked experiment.
    queryset = ExperimentVariantAnnotation.objects.unscoped().select_related("created_by").order_by("-created_at")

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        super().initial(request, *args, **kwargs)
        # Every action is gated on the parent experiment, so a viewer can read and an editor can write.
        self.check_object_permissions(request, self.experiment)

    @cached_property
    def experiment(self) -> Experiment:
        try:
            experiment_id = int(self.parents_query_dict["experiment_id"])
        except (KeyError, TypeError, ValueError):
            raise NotFound("Experiment not found.")
        experiment = (
            Experiment.objects.select_related("feature_flag")
            .filter(id=experiment_id, team__project_id=self.team.project_id)
            .exclude(deleted=True)
            .first()
        )
        if experiment is None:
            raise NotFound("Experiment not found.")
        return experiment

    def safely_get_queryset(self, queryset: Any) -> Any:
        return queryset.filter(experiment_id=self.experiment.id)

    def get_serializer_context(self) -> dict[str, Any]:
        return {**super().get_serializer_context(), "experiment": self.experiment}

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        annotation = serializer.save(
            experiment=self.experiment, team_id=self.experiment.team_id, created_by=self.request.user
        )
        log_variant_annotation_activity(
            experiment=self.experiment,
            user=cast("User", self.request.user),
            activity="created",
            before=None,
            after=self.annotation_snapshot(annotation),
            was_impersonated=is_impersonated_session(self.request),
        )

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        before = self.annotation_snapshot(cast(ExperimentVariantAnnotation, serializer.instance))
        annotation = serializer.save()
        log_variant_annotation_activity(
            experiment=self.experiment,
            user=cast("User", self.request.user),
            activity="updated",
            before=before,
            after=self.annotation_snapshot(annotation),
            was_impersonated=is_impersonated_session(self.request),
        )

    def perform_destroy(self, instance: ExperimentVariantAnnotation) -> None:
        before = self.annotation_snapshot(instance)
        instance.delete()
        log_variant_annotation_activity(
            experiment=self.experiment,
            user=cast("User", self.request.user),
            activity="deleted",
            before=before,
            after=None,
            was_impersonated=is_impersonated_session(self.request),
        )

    @staticmethod
    def annotation_snapshot(annotation: ExperimentVariantAnnotation) -> dict[str, str]:
        return {"id": str(annotation.id), "variant_key": annotation.variant_key, "content": annotation.content}

    def safely_get_object(self, queryset: Any) -> ExperimentVariantAnnotation | None:
        try:
            instance = queryset.filter(pk=self.kwargs["pk"]).first()
        except (ValueError, DjangoValidationError):
            return None
        # Checked before the serializer runs, so a non-author gets 403 rather than a validation error.
        if (
            instance is not None
            and self.action in ("update", "partial_update", "destroy")
            and instance.created_by_id != self.request.user.id
        ):
            raise PermissionDenied("You can only change annotations you wrote.")
        return instance
