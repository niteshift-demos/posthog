import re

from markdown_it import MarkdownIt
from rest_framework.exceptions import ValidationError

from posthog.rbac.user_access_control import UserAccessControl

from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_variant_annotation import ExperimentVariantAnnotation
from products.notifications.backend.facade.api import (
    NotificationData,
    NotificationType,
    SourceType,
    TargetType,
    create_notification,
)


def annotation_mention_ids(content: str) -> set[int]:
    # Match LemonMarkdown's mention syntax in visible text, excluding code and link destinations.
    return {
        int(match)
        for token in MarkdownIt().enable(["table", "strikethrough"]).parse(content)
        for child in token.children or []
        if child.type == "text"
        for match in re.findall(r"(?:^|\s)@member:([0-9]{1,19})(?![0-9])", child.content, re.IGNORECASE)
    }


def notify_annotation_mentions(annotation: ExperimentVariantAnnotation, previous_content: str = "") -> None:
    author = annotation.created_by
    if author is None:
        return
    new_mentions = annotation_mention_ids(annotation.content) - annotation_mention_ids(previous_content) - {author.id}
    if not new_mentions:
        return
    experiment = annotation.experiment
    team = experiment.team
    for recipient in team.all_users_with_access().filter(id__in=new_mentions):
        access = UserAccessControl(recipient, team)
        if not access.check_access_level_for_object(team, "member") or not access.check_access_level_for_object(
            experiment, "viewer"
        ):
            continue
        create_notification(
            NotificationData(
                team_id=team.id,
                notification_type=NotificationType.COMMENT_MENTION,
                title=f"@{author.first_name or author.email} mentioned you in a variant annotation",
                body=f"{experiment.name} ({annotation.variant_key})"[:200],
                target_type=TargetType.USER,
                target_id=str(recipient.id),
                resource_type="experiment",
                resource_id=str(experiment.id),
                source_type=SourceType.EXPERIMENT,
                source_id=str(experiment.id),
                source_url=f"/project/{team.id}/experiments/{experiment.id}",
            )
        )


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
