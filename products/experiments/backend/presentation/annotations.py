from functools import cached_property
from typing import Any, Literal, cast

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404

from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.api.shared import UserBasicSerializer
from posthog.models.user import User
from posthog.permissions import is_service_auth

from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_annotation import ExperimentAnnotation


class ExperimentAnnotationSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True, help_text="The annotation ID.")
    experiment = serializers.IntegerField(source="experiment_id", read_only=True, help_text="The experiment ID.")
    variant_key = serializers.CharField(max_length=400, help_text="The key of a variant belonging to this experiment.")
    content = serializers.CharField(max_length=8192, help_text="The annotation text. Cannot be empty.")
    created_by = UserBasicSerializer(read_only=True, allow_null=True, help_text="The author of the annotation.")
    created_at = serializers.DateTimeField(read_only=True, help_text="When the annotation was created.")
    updated_at = serializers.DateTimeField(read_only=True, help_text="When the annotation was last updated.")

    class Meta:
        model = ExperimentAnnotation
        fields = ["id", "experiment", "variant_key", "content", "created_by", "created_at", "updated_at"]

    def validate_variant_key(self, value: str) -> str:
        experiment = cast(Experiment, self.context["experiment"])
        if value not in {variant["key"] for variant in experiment.feature_flag.variants}:
            raise serializers.ValidationError("Select a variant that belongs to this experiment.")
        return value


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter("experiment_id", int, OpenApiParameter.PATH)]),
    retrieve=extend_schema(parameters=[OpenApiParameter("experiment_id", int, OpenApiParameter.PATH)]),
    create=extend_schema(parameters=[OpenApiParameter("experiment_id", int, OpenApiParameter.PATH)]),
    update=extend_schema(parameters=[OpenApiParameter("experiment_id", int, OpenApiParameter.PATH)]),
    partial_update=extend_schema(parameters=[OpenApiParameter("experiment_id", int, OpenApiParameter.PATH)]),
    destroy=extend_schema(parameters=[OpenApiParameter("experiment_id", int, OpenApiParameter.PATH)]),
)
class ExperimentAnnotationViewSet(TeamAndOrgViewSetMixin, viewsets.ModelViewSet):
    scope_object: Literal["experiment"] = "experiment"
    serializer_class = ExperimentAnnotationSerializer
    queryset = ExperimentAnnotation.objects.unscoped().select_related("created_by")
    pagination_class = None

    @cached_property
    def experiment(self) -> Experiment:
        experiment = get_object_or_404(
            Experiment.objects.select_related("feature_flag"),
            id=self.kwargs["experiment_id"],
            team_id=self.team_id,
            deleted=False,
        )
        required_level: Literal["viewer", "editor"] = "viewer" if self.request.method in SAFE_METHODS else "editor"
        if not is_service_auth(self.request) and not self.user_access_control.check_access_level_for_object(
            experiment, required_level=required_level
        ):
            raise PermissionDenied("You do not have access to annotate this experiment.")
        return experiment

    def safely_get_queryset(self, queryset: QuerySet[ExperimentAnnotation]) -> QuerySet[ExperimentAnnotation]:
        if getattr(self, "swagger_fake_view", False):
            return queryset.none()
        return queryset.filter(team_id=self.team_id, experiment=self.experiment)

    def get_serializer_context(self) -> dict[str, Any]:
        if getattr(self, "swagger_fake_view", False):
            return super().get_serializer_context()
        return {**super().get_serializer_context(), "experiment": self.experiment}

    def perform_create(self, serializer: serializers.BaseSerializer[Any]) -> None:
        serializer.save(
            experiment=self.experiment,
            team_id=self.team_id,
            created_by=None if is_service_auth(self.request) else cast(User, self.request.user),
        )
