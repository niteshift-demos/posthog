from typing import Any, Literal

from django.db.models import QuerySet
from django.utils import timezone

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers, viewsets
from rest_framework.generics import get_object_or_404
from rest_framework.request import Request

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.api.shared import UserBasicSerializer

from products.experiments.backend.models.experiment import Experiment, ExperimentAnnotation


class ExperimentAnnotationSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True, help_text="Unique annotation ID.")
    variant_key = serializers.CharField(max_length=400, help_text="Key of a variant belonging to this experiment.")
    content = serializers.CharField(max_length=10000, help_text="Annotation text, up to 10,000 characters.")
    created_by = UserBasicSerializer(read_only=True, allow_null=True, help_text="Author of the annotation.")
    created_at = serializers.DateTimeField(read_only=True, help_text="When the annotation was created.")
    updated_at = serializers.DateTimeField(read_only=True, help_text="When the annotation was last edited.")

    class Meta:
        model = ExperimentAnnotation
        fields = ["id", "variant_key", "content", "created_by", "created_at", "updated_at"]

    def validate_variant_key(self, value: str) -> str:
        experiment: Experiment = self.context["experiment"]
        if value not in {variant["key"] for variant in experiment.feature_flag.variants}:
            raise serializers.ValidationError("Select a variant belonging to this experiment.")
        return value


@extend_schema_view(
    list=extend_schema(description="List variant annotations for an experiment."),
    retrieve=extend_schema(description="Retrieve an experiment variant annotation."),
    create=extend_schema(description="Add an annotation to an experiment variant."),
    partial_update=extend_schema(description="Edit an experiment variant annotation."),
    destroy=extend_schema(description="Delete an experiment variant annotation."),
)
class ExperimentAnnotationViewSet(TeamAndOrgViewSetMixin, viewsets.ModelViewSet):
    scope_object: Literal["experiment"] = "experiment"
    serializer_class = ExperimentAnnotationSerializer
    queryset = ExperimentAnnotation.objects.unscoped().none()
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        super().initial(request, *args, **kwargs)
        self.experiment = get_object_or_404(
            Experiment.objects.select_related("feature_flag"),
            team_id=self.team_id,
            id=self.parents_query_dict["experiment_id"],
            deleted=False,
        )
        self.check_object_permissions(request, self.experiment)

    def safely_get_queryset(self, queryset: QuerySet) -> QuerySet:
        return (
            ExperimentAnnotation.objects.for_team(self.team_id)
            .select_related("created_by")
            .order_by("-created_at", "-id")
        )

    def get_serializer_context(self) -> dict[str, Any]:
        context = super().get_serializer_context()
        context["experiment"] = getattr(self, "experiment", None)
        return context

    def perform_create(self, serializer: ExperimentAnnotationSerializer) -> None:
        now = timezone.now()
        serializer.save(
            team_id=self.team_id,
            experiment=self.experiment,
            created_by=self.request.user,
            created_at=now,
            updated_at=now,
        )

    def perform_update(self, serializer: ExperimentAnnotationSerializer) -> None:
        serializer.save(updated_at=timezone.now())
