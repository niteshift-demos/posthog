from posthog.test.base import APIBaseTest

from parameterized import parameterized
from rest_framework import status

from posthog.constants import AvailableFeature
from posthog.models import Organization, OrganizationMembership, Team, User
from posthog.models.activity_logging.activity_log import ActivityLog

from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_variant_annotation import ExperimentVariantAnnotation
from products.feature_flags.backend.models.feature_flag import FeatureFlag

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

    def test_annotation_lifecycle_is_logged_under_parent_experiment(self) -> None:
        with self.captureOnCommitCallbacks(execute=True):
            created = self._create()
        original = {"id": created["id"], "variant_key": "test", "content": "Test won on conversion"}
        revised = {**original, "variant_key": "control", "content": "Revised note"}

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                self._url(self.experiment.id, created["id"]),
                {"variant_key": "control", "content": "Revised note"},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(self._url(self.experiment.id, created["id"]))
        assert response.status_code == status.HTTP_204_NO_CONTENT

        logs = list(
            ActivityLog.objects.filter(
                team_id=self.team.id,
                scope="Experiment",
                item_id=str(self.experiment.id),
                detail__type="variant_annotation",
            ).order_by("created_at")
        )
        assert len(logs) == 3
        for log, activity, action, before, after in zip(
            logs,
            ["created", "updated", "deleted"],
            ["created", "changed", "deleted"],
            [None, original, revised],
            [original, revised, None],
        ):
            assert log.activity == f"variant_annotation_{activity}"
            assert log.user_id == self.user.id
            assert log.organization_id == self.organization.id
            assert log.detail is not None
            assert log.detail["name"] == self.experiment.name
            assert log.detail["changes"] == [
                {
                    "type": "Experiment",
                    "action": action,
                    "field": "variant_annotation",
                    "before": before,
                    "after": after,
                }
            ]

    def test_unchanged_note_does_not_add_history(self) -> None:
        with self.captureOnCommitCallbacks(execute=True):
            created = self._create()
        before_count = ActivityLog.objects.count()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                self._url(self.experiment.id, created["id"]),
                {"content": created["content"]},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert ActivityLog.objects.count() == before_count

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
        with self.captureOnCommitCallbacks(execute=True):
            created = self._create()
        teammate = User.objects.create_and_join(self.organization, "teammate@example.com", "password")
        self.client.force_login(teammate)
        before_count = ActivityLog.objects.count()

        listed = self.client.get(self._url(self.experiment.id))
        with self.captureOnCommitCallbacks(execute=True):
            patched = self.client.patch(
                self._url(self.experiment.id, created["id"]), {"content": "mine"}, format="json"
            )
            deleted = self.client.delete(self._url(self.experiment.id, created["id"]))

        assert listed.status_code == status.HTTP_200_OK
        assert [a["id"] for a in listed.json()["results"]] == [created["id"]]
        assert patched.status_code == status.HTTP_403_FORBIDDEN
        assert deleted.status_code == status.HTTP_403_FORBIDDEN
        assert ActivityLog.objects.count() == before_count
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
