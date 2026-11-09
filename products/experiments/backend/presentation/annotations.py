from rest_framework import serializers

from posthog.api.shared import UserBasicSerializer

from products.experiments.backend.models.experiment import Experiment, ExperimentAnnotation


class ExperimentAnnotationSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True, help_text="Identifier of this experiment annotation.")
    variant_key = serializers.CharField(max_length=400, help_text="Key of a variant belonging to this experiment.")
    content = serializers.CharField(max_length=8192, help_text="Plain-text note about the selected variant.")
    created_by = UserBasicSerializer(read_only=True, allow_null=True, help_text="Author of the annotation.")
    created_at = serializers.DateTimeField(read_only=True, help_text="Time the annotation was created.")
    updated_at = serializers.DateTimeField(read_only=True, help_text="Time the annotation was last edited.")

    class Meta:
        model = ExperimentAnnotation
        fields = ["id", "variant_key", "content", "created_by", "created_at", "updated_at"]

    def validate_variant_key(self, value: str) -> str:
        experiment: Experiment = self.context["experiment"]
        if value not in {variant["key"] for variant in experiment.feature_flag.variants}:
            raise serializers.ValidationError("Select a variant belonging to this experiment.")
        return value
