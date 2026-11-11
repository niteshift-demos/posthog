from django.db import models

from posthog.models.scoping.root_mixin import TeamScopedRootMixin
from posthog.models.utils import UUIDModel


class ExperimentVariantAnnotation(TeamScopedRootMixin, UUIDModel):
    """A user-authored note pinned to one variant of an experiment.

    Separate from `Experiment.conclusion_comment`, which records the experiment's single outcome.
    """

    # db_constraint=False: a real FK constraint to the hot posthog_team / posthog_user tables
    # takes a parent lock during migration; the migration adds them back as NOT VALID.
    team = models.ForeignKey("posthog.Team", on_delete=models.CASCADE, db_constraint=False)
    # Indexed through the composite (experiment, created_at) index below.
    experiment = models.ForeignKey(
        "Experiment", on_delete=models.CASCADE, related_name="variant_annotations", db_index=False
    )
    variant_key = models.CharField(max_length=400)
    content = models.TextField()

    created_by = models.ForeignKey(
        "posthog.User", on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["experiment", "created_at"], name="exp_variant_annotation_idx"),
        ]

    def __str__(self) -> str:
        return f"ExperimentVariantAnnotation(exp={self.experiment_id}, variant={self.variant_key})"
