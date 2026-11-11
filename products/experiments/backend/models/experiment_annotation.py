from django.db import models

from posthog.models.scoping.root_mixin import TeamScopedRootMixin


class ExperimentAnnotation(TeamScopedRootMixin):
    team = models.ForeignKey("posthog.Team", on_delete=models.CASCADE, db_constraint=False)
    experiment = models.ForeignKey("experiments.Experiment", on_delete=models.CASCADE, related_name="annotations")
    variant_key = models.CharField(max_length=400)
    content = models.CharField(max_length=8192)
    created_by = models.ForeignKey(
        "posthog.User", on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
