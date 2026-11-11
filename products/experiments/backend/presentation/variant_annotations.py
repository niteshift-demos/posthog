from functools import cached_property
from typing import Any, Literal

from django.core.exceptions import ValidationError as DjangoValidationError

from drf_spectacular.utils import extend_schema, extend_schema_field
from rest_framework import serializers, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.request import Request

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.api.shared import UserBasicSerializer

from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_variant_annotation import ExperimentVariantAnnotation
from products.experiments.backend.variant_annotations import validate_annotation_variant_key

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
    can_edit = serializers.SerializerMethodField(
        help_text="Whether you can edit this note. Only its author can edit it."
    )
    can_delete = serializers.SerializerMethodField(
        help_text="Whether you can delete this note as its author, an organization admin, an experiment manager, or an editor when its author was deleted."
    )

    class Meta:
        model = ExperimentVariantAnnotation
        fields = [
            "id",
            "experiment",
            "variant_key",
            "content",
            "created_by",
            "created_at",
            "updated_at",
            "can_edit",
            "can_delete",
        ]
        read_only_fields = ["id", "experiment", "created_by", "created_at", "updated_at"]
        extra_kwargs = {
            "id": {"help_text": "Unique identifier of the annotation."},
            "experiment": {"help_text": "ID of the experiment the annotation belongs to."},
            "created_at": {"help_text": "When the note was written."},
            "updated_at": {"help_text": "When the note was last changed."},
        }

    @extend_schema_field(serializers.BooleanField)
    def get_can_edit(self, instance: ExperimentVariantAnnotation) -> bool:
        return self.context["view"].can_edit_annotation(instance)

    @extend_schema_field(serializers.BooleanField)
    def get_can_delete(self, instance: ExperimentVariantAnnotation) -> bool:
        return self.context["view"].can_delete_annotation(instance)

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
        serializer.save(experiment=self.experiment, team_id=self.experiment.team_id, created_by=self.request.user)

    @cached_property
    def can_write_annotations(self) -> bool:
        return self.user_access_control.check_access_level_for_object(self.experiment, "editor")

    @cached_property
    def can_moderate_annotations(self) -> bool:
        return self.user_access_control.is_organization_admin or (
            self.user_access_control.access_controls_supported
            and self.user_access_control.check_access_level_for_object(self.experiment, "manager")
        )

    def can_edit_annotation(self, instance: ExperimentVariantAnnotation) -> bool:
        return self.can_write_annotations and instance.created_by_id == self.request.user.id

    def can_delete_annotation(self, instance: ExperimentVariantAnnotation) -> bool:
        return self.can_write_annotations and (
            instance.created_by_id == self.request.user.id
            or self.can_moderate_annotations
            or instance.created_by_id is None
        )

    def safely_get_object(self, queryset: Any) -> ExperimentVariantAnnotation | None:
        try:
            instance = queryset.filter(pk=self.kwargs["pk"]).first()
        except (ValueError, DjangoValidationError):
            return None
        # Checked before the serializer runs, so an unauthorized write gets 403 rather than a validation error.
        if instance is not None:
            if self.action in ("update", "partial_update") and not self.can_edit_annotation(instance):
                raise PermissionDenied("You can only edit annotations you wrote.")
            if self.action == "destroy" and not self.can_delete_annotation(instance):
                raise PermissionDenied("You don't have permission to delete this annotation.")
        return instance
