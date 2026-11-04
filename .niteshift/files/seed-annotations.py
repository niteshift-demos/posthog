import sys
import json
from datetime import timedelta
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from posthog.models import Team, User

from products.annotations.backend.models.annotation import Annotation
from products.dashboards.backend.models.dashboard import Dashboard
from products.product_analytics.backend.models.insight import Insight


def seed_annotations() -> None:
    user = User.objects.get(email="test@posthog.com", is_active=True)
    team = Team.objects.get(api_token="phc_localposthogprojecttoken", is_demo=True, organization__members=user)
    seeds = json.loads(Path(".niteshift/files/annotations.json").read_text())
    today = timezone.now().replace(hour=12, minute=0, second=0, microsecond=0)
    created_count = 0

    with transaction.atomic():
        for seed in seeds:
            dashboard = (
                Dashboard.objects.get(team=team, name=seed["dashboard_name"]) if "dashboard_name" in seed else None
            )
            insight = (
                Insight.objects.get(team=team, name=seed["insight_name"], deleted=False)
                if "insight_name" in seed
                else None
            )
            _, created = Annotation.objects.get_or_create(
                team=team,
                content=seed["content"],
                defaults={
                    "organization": team.organization,
                    "created_by": user,
                    "scope": seed["scope"],
                    "dashboard": dashboard,
                    "dashboard_item": insight,
                    "emoji": seed["emoji"],
                    "date_marker": today - timedelta(days=seed["days_ago"]),
                    "creation_type": Annotation.CreationType.USER,
                    "hidden_in_user_interface": False,
                },
            )
            created_count += int(created)

    sys.stdout.write(f"Demo annotations: {created_count} created, {len(seeds) - created_count} already present\n")


seed_annotations()
