from rest_framework.exceptions import ValidationError

from products.experiments.backend.models.experiment import Experiment


def experiment_variant_keys(experiment: Experiment) -> list[str]:
    # The linked feature flag is the source of truth for an experiment's variants.
    return [variant["key"] for variant in experiment.feature_flag.variants if variant.get("key")]


def validate_annotation_variant_key(experiment: Experiment, variant_key: str) -> str:
    valid_keys = experiment_variant_keys(experiment)
    if variant_key not in valid_keys:
        raise ValidationError(
            f"Variant '{variant_key}' does not belong to this experiment. Valid variants: {', '.join(valid_keys) or 'none'}."
        )
    return variant_key
