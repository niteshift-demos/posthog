from posthog.test.base import APIBaseTest
from unittest.mock import patch

from django.test import SimpleTestCase

from parameterized import parameterized
from rest_framework import status

from posthog.constants import AvailableFeature
from posthog.models import Organization, OrganizationMembership, Team, User

from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_variant_annotation import ExperimentVariantAnnotation
from products.experiments.backend.variant_annotations import annotation_mention_ids
from products.feature_flags.backend.models.feature_flag import FeatureFlag
from products.notifications.backend.models import NotificationEvent

from ee.api.test.base import APILicensedTest
from ee.models.rbac.access_control import AccessControl


def _create_experiment(team: Team, user: User, flag_key: str, deleted: bool | None = False) -> Experiment:
    flag = FeatureFlag.objects.create(
        team=team,
        created_by=user,
        key=flag_key,
        filters={
            "groups": [{"properties": [], "rollout_percentage": 100}],
            "multivariate": {
                "variants": [
                    {"key": "control", "rollout_percentage": 50},
                    {"key": "test", "rollout_percentage": 50},
                ]
            },
        },
    )
    return Experiment.objects.create(team=team, created_by=user, feature_flag=flag, name=flag_key, deleted=deleted)


class TestAnnotationMarkdownMentions(SimpleTestCase):
    @parameterized.expand([("~~@member:42~~",), ("| Reviewer |\n| --- |\n|@member:42|",)])
    def test_mentions_in_gfm_formatting_match_the_renderer(self, content: str) -> None:
        assert annotation_mention_ids(content) == {42}


class TestExperimentVariantAnnotationsAPI(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        self.experiment = _create_experiment(self.team, self.user, "annotated-flag")

    def _url(self, experiment_id: int, annotation_id: str | None = None, project_id: int | None = None) -> str:
        base = f"/api/projects/{project_id or self.team.id}/experiments/{experiment_id}/variant_annotations/"
        return f"{base}{annotation_id}/" if annotation_id else base

    def _create(self, experiment: Experiment | None = None, **data: str) -> dict:
        experiment = experiment or self.experiment
        payload = {"variant_key": "test", "content": "Test won on conversion", **data}
        response = self.client.post(self._url(experiment.id), payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        return response.json()

    def test_create_returns_author_and_lists_only_for_its_experiment(self) -> None:
        sibling = _create_experiment(self.team, self.user, "sibling-flag")
        created = self._create()

        assert created["variant_key"] == "test"
        assert created["experiment"] == self.experiment.id
        assert created["created_by"]["id"] == self.user.id
        assert created["created_at"] is not None

        own = self.client.get(self._url(self.experiment.id)).json()["results"]
        assert [a["id"] for a in own] == [created["id"]]
        assert self.client.get(self._url(sibling.id)).json()["results"] == []

    @patch("posthoganalytics.feature_enabled", return_value=True)
    def test_mentions_notify_once_and_edits_only_notify_new_recipients(self, _flag: object) -> None:
        first = User.objects.create_and_join(self.organization, "first@example.com", "password")
        second = User.objects.create_and_join(self.organization, "second@example.com", "password")
        content = f"**Review** @member:{first.id} and @member:{first.id} @member:{self.user.id}"
        created = self._create(content=content)
        event = NotificationEvent.objects.get()
        assert event.resolved_user_ids == [first.id]
        assert event.source_url == f"/project/{self.team.id}/experiments/{self.experiment.id}"
        assert event.resource_type == "experiment"
        assert event.body == f"{self.experiment.name} (test)"

        for updated_content in (content + " revised", content + f" @member:{second.id}"):
            response = self.client.patch(
                self._url(self.experiment.id, created["id"]), {"content": updated_content}, format="json"
            )
            assert response.status_code == status.HTTP_200_OK
        assert list(NotificationEvent.objects.order_by("created_at").values_list("resolved_user_ids", flat=True)) == [
            [first.id],
            [second.id],
        ]

    @patch("posthoganalytics.feature_enabled", return_value=True)
    def test_mentions_ignore_code_link_destinations_and_non_members(self, _flag: object) -> None:
        teammate = User.objects.create_and_join(self.organization, "teammate@example.com", "password")
        outsider = User.objects.create_user("outsider@example.com", "password", first_name="Outside member")
        self._create(
            content=f"`@member:{teammate.id}`\n\n```\n@member:{teammate.id}\n```\n\n"
            f"[link](https://example.com/@member:{teammate.id}) @member:{outsider.id} @member:999999999"
            f" @member:{'9' * 4500}"
        )
        assert not NotificationEvent.objects.exists()

    @parameterized.expand([("create",), ("update",)])
    def test_unknown_variant_key_is_rejected(self, action: str) -> None:
        if action == "create":
            response = self.client.post(
                self._url(self.experiment.id), {"variant_key": "not-a-variant", "content": "hi"}, format="json"
            )
        else:
            annotation = self._create()
            response = self.client.patch(
                self._url(self.experiment.id, annotation["id"]), {"variant_key": "not-a-variant"}, format="json"
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.json()
        assert response.json()["attr"] == "variant_key"

    @parameterized.expand(
        [
            ("missing", {"variant_key": "control"}),
            ("blank", {"variant_key": "control", "content": ""}),
            ("too_long", {"variant_key": "control", "content": "x" * 5001}),
        ]
    )
    def test_invalid_content_is_rejected(self, _name: str, payload: dict) -> None:
        response = self.client.post(self._url(self.experiment.id), payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.json()
        assert response.json()["attr"] == "content"
        assert not ExperimentVariantAnnotation.objects.filter(experiment=self.experiment).exists()

    def test_partial_update_changes_content_and_bumps_updated_at(self) -> None:
        created = self._create()

        response = self.client.patch(
            self._url(self.experiment.id, created["id"]), {"content": "Revised note"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK, response.json()
        body = response.json()
        assert body["content"] == "Revised note"
        assert body["variant_key"] == "test"
        assert body["updated_at"] > created["updated_at"]

    def test_destroy_removes_annotation(self) -> None:
        created = self._create()

        response = self.client.delete(self._url(self.experiment.id, created["id"]))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ExperimentVariantAnnotation.objects.filter(id=created["id"]).exists()

    @parameterized.expand([("get",), ("patch",), ("delete",)])
    def test_annotation_is_not_reachable_through_another_experiments_url(self, method: str) -> None:
        sibling = _create_experiment(self.team, self.user, "sibling-flag")
        created = self._create()

        response = getattr(self.client, method)(
            self._url(sibling.id, created["id"]), {"content": "hijacked"}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert ExperimentVariantAnnotation.objects.get(id=created["id"]).content == "Test won on conversion"

    def test_experiment_in_another_organization_is_not_reachable(self) -> None:
        other_org = Organization.objects.create(name="Other org")
        other_team = Team.objects.create(organization=other_org, name="Other team")
        other_user = User.objects.create_and_join(other_org, "other@example.com", "password")
        foreign_experiment = _create_experiment(other_team, other_user, "foreign-flag")

        via_own_project = self.client.post(
            self._url(foreign_experiment.id), {"variant_key": "test", "content": "x"}, format="json"
        )
        via_foreign_project = self.client.post(
            self._url(foreign_experiment.id, project_id=other_team.id),
            {"variant_key": "test", "content": "x"},
            format="json",
        )

        assert via_own_project.status_code == status.HTTP_404_NOT_FOUND
        assert via_foreign_project.status_code == status.HTTP_403_FORBIDDEN
        assert not ExperimentVariantAnnotation.objects.unscoped().filter(experiment=foreign_experiment).exists()

    @parameterized.expand(
        [("soft_deleted", True, status.HTTP_404_NOT_FOUND), ("legacy_null", None, status.HTTP_200_OK)]
    )
    def test_deleted_flag_controls_reachability(self, _name: str, deleted: bool | None, expected: int) -> None:
        experiment = _create_experiment(self.team, self.user, "maybe-deleted-flag", deleted=deleted)

        assert self.client.get(self._url(experiment.id)).status_code == expected

    def test_note_on_removed_variant_stays_editable_while_variant_is_unchanged(self) -> None:
        created = self._create(variant_key="test")
        flag = self.experiment.feature_flag
        flag.filters = {**flag.filters, "multivariate": {"variants": [{"key": "control", "rollout_percentage": 100}]}}
        flag.save()

        response = self.client.patch(
            self._url(self.experiment.id, created["id"]),
            {"variant_key": "test", "content": "Variant was rolled back"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()["content"] == "Variant was rolled back"

    def test_only_author_can_change_annotation_but_teammates_can_read_it(self) -> None:
        created = self._create()
        teammate = User.objects.create_and_join(self.organization, "teammate@example.com", "password")
        self.client.force_login(teammate)

        listed = self.client.get(self._url(self.experiment.id))
        patched = self.client.patch(self._url(self.experiment.id, created["id"]), {"content": "mine"}, format="json")
        deleted = self.client.delete(self._url(self.experiment.id, created["id"]))

        assert listed.status_code == status.HTTP_200_OK
        assert [a["id"] for a in listed.json()["results"]] == [created["id"]]
        assert patched.status_code == status.HTTP_403_FORBIDDEN
        assert deleted.status_code == status.HTTP_403_FORBIDDEN
        assert ExperimentVariantAnnotation.objects.get(id=created["id"]).content == "Test won on conversion"


class TestExperimentVariantAnnotationsAccessControl(APILicensedTest):
    def setUp(self) -> None:
        super().setUp()
        self.organization.available_product_features = [
            {"key": AvailableFeature.ACCESS_CONTROL, "name": AvailableFeature.ACCESS_CONTROL}
        ]
        self.organization.save()
        self.organization_membership.level = OrganizationMembership.Level.MEMBER
        self.organization_membership.save()
        owner = User.objects.create_and_join(self.organization, "owner@example.com", "password")
        self.granted = _create_experiment(self.team, owner, "granted-flag")
        self.restricted = _create_experiment(self.team, owner, "restricted-flag")
        AccessControl.objects.create(team=self.team, resource="experiment", resource_id=None, access_level="viewer")
        AccessControl.objects.create(
            team=self.team,
            resource="experiment",
            resource_id=str(self.granted.id),
            organization_member=self.organization_membership,
            access_level="editor",
        )

    def _url(self, experiment: Experiment) -> str:
        return f"/api/projects/{self.team.id}/experiments/{experiment.id}/variant_annotations/"

    @parameterized.expand(
        [
            ("editor_grant_on_experiment", "granted", status.HTTP_201_CREATED),
            ("viewer_only", "restricted", status.HTTP_403_FORBIDDEN),
        ]
    )
    def test_create_follows_access_to_the_parent_experiment(self, _name: str, which: str, expected: int) -> None:
        experiment = getattr(self, which)
        response = self.client.post(self._url(experiment), {"variant_key": "test", "content": "note"}, format="json")
        assert response.status_code == expected, response.json()

    def test_viewer_can_list_annotations(self) -> None:
        response = self.client.get(self._url(self.restricted))
        assert response.status_code == status.HTTP_200_OK

    @parameterized.expand([("project",), ("experiment",)])
    @patch("posthoganalytics.feature_enabled", return_value=True)
    def test_mentions_do_not_notify_users_without_access(self, resource: str, _flag: object) -> None:
        recipient = User.objects.create_and_join(self.organization, "recipient@example.com", "password")
        membership = OrganizationMembership.objects.get(organization=self.organization, user=recipient)
        AccessControl.objects.create(
            team=self.team,
            resource=resource,
            resource_id=str(self.team.id if resource == "project" else self.granted.id),
            organization_member=membership,
            access_level="none",
        )
        response = self.client.post(
            self._url(self.granted),
            {"variant_key": "test", "content": f"Please review @member:{recipient.id}"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        assert not NotificationEvent.objects.exists()
