from typing import Any

from posthog.test.base import APIBaseTest

from django.test import SimpleTestCase

from parameterized import parameterized

from posthog.constants import AvailableFeature
from posthog.models import Team

from products.experiments.backend.models.experiment import Experiment, ExperimentAnnotation
from products.experiments.backend.presentation.annotations import ExperimentAnnotationSerializer
from products.feature_flags.backend.models.feature_flag import FeatureFlag

from ee.models.rbac.access_control import AccessControl


class TestExperimentAnnotationValidation(SimpleTestCase):
    @parameterized.expand([("blank", ""), ("whitespace", "  "), ("too_long", "x" * 10001)])
    def test_rejects_invalid_content(self, _name: str, content: str) -> None:
        serializer = ExperimentAnnotationSerializer(data={"content": content}, partial=True)
        assert not serializer.is_valid()
        assert "content" in serializer.errors


class TestExperimentAnnotations(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        self.experiment = self.create_experiment(self.team)
        self.url = f"/api/projects/{self.team.id}/experiments/{self.experiment.id}/annotations/"

    def create_experiment(self, team: Team) -> Experiment:
        flag = FeatureFlag.objects.create(
            team=team,
            key=f"experiment-{team.id}",
            filters={
                "groups": [],
                "multivariate": {
                    "variants": [
                        {"key": "control", "rollout_percentage": 50},
                        {"key": "test", "rollout_percentage": 50},
                    ]
                },
            },
        )
        return Experiment.objects.create(team=team, feature_flag=flag, name="Checkout", conclusion="won")

    def create_annotation(self) -> dict[str, Any]:
        response = self.client.post(
            self.url,
            {"variant_key": "test", "content": "Shipped after reviewing results", "created_by": None},
        )
        assert response.status_code == 201, response.json()
        return response.json()

    def test_annotation_lifecycle_preserves_author_and_conclusion(self) -> None:
        annotation = self.create_annotation()
        assert annotation["created_by"]["id"] == self.user.id
        assert annotation["created_at"]
        assert annotation["created_at"] == annotation["updated_at"]
        assert self.client.get(self.url).json() == [annotation]

        detail_url = f"{self.url}{annotation['id']}/"
        response = self.client.patch(detail_url, {"content": "Reviewed again", "variant_key": "control"})
        assert response.status_code == 200
        persisted = ExperimentAnnotation.objects.for_team(self.team.id).get(id=annotation["id"])
        assert persisted.content == "Reviewed again"
        assert persisted.variant_key == "control"
        assert persisted.created_by_id == self.user.id
        self.experiment.refresh_from_db()
        assert self.experiment.conclusion == "won"
        assert self.experiment.conclusion_comment is None

        assert self.client.delete(detail_url).status_code == 204
        assert self.client.get(self.url).json() == []
        assert self.client.get(detail_url).status_code == 404

    @parameterized.expand([("post",), ("patch",)])
    def test_variant_must_belong_to_experiment(self, method: str) -> None:
        url = self.url
        if method == "patch":
            annotation = self.create_annotation()
            url = f"{url}{annotation['id']}/"
        response = getattr(self.client, method)(url, {"variant_key": "unrelated", "content": "Note"})
        assert response.status_code == 400
        if method == "patch":
            assert self.client.get(url).json()["variant_key"] == "test"
        else:
            assert self.client.get(self.url).json() == []

    def test_annotations_cannot_be_accessed_through_another_experiment(self) -> None:
        annotation = self.create_annotation()
        flag = FeatureFlag.objects.create(team=self.team, key="another-experiment", filters={"groups": []})
        other = Experiment.objects.create(team=self.team, feature_flag=flag, name="Other")
        wrong_url = f"/api/projects/{self.team.id}/experiments/{other.id}/annotations/{annotation['id']}/"
        for method in ("get", "patch", "delete"):
            assert getattr(self.client, method)(wrong_url).status_code == 404

    def test_cross_project_access_is_denied(self) -> None:
        annotation = self.create_annotation()
        other_team = Team.objects.create(organization=self.organization, name="Other project")
        other_experiment = self.create_experiment(other_team)
        foreign_parent = f"/api/projects/{other_team.id}/experiments/{self.experiment.id}/annotations/"
        for method in ("get", "post"):
            response = getattr(self.client, method)(foreign_parent, {"variant_key": "test", "content": "Note"})
            assert response.status_code == 404

        foreign_detail = (
            f"/api/projects/{other_team.id}/experiments/{other_experiment.id}/annotations/{annotation['id']}/"
        )
        for method in ("get", "patch", "delete"):
            assert getattr(self.client, method)(foreign_detail).status_code == 404
        assert self.client.get(f"{self.url}{annotation['id']}/").status_code == 200

    def test_experiment_in_inaccessible_project_is_denied(self) -> None:
        other_org = self.create_organization_with_features([])
        other_team = Team.objects.create(organization=other_org, name="Private project")
        experiment = self.create_experiment(other_team)
        url = f"/api/projects/{other_team.id}/experiments/{experiment.id}/annotations/"
        assert self.client.get(url).status_code == 403
        assert self.client.post(url, {"variant_key": "test", "content": "Note"}).status_code == 403

    @parameterized.expand([("viewer", 200), ("none", 403)])
    def test_parent_experiment_permissions_apply_to_annotations(self, access_level: str, read_status: int) -> None:
        annotation = self.create_annotation()
        self.organization.available_product_features = [
            {"key": AvailableFeature.ACCESS_CONTROL, "name": AvailableFeature.ACCESS_CONTROL}
        ]
        self.organization.save()
        reader = self._create_user("annotation-reader@example.com")
        AccessControl.objects.create(
            team=self.team,
            resource="experiment",
            resource_id=str(self.experiment.pk),
            access_level=access_level,
        )
        self.client.force_login(reader)
        detail_url = f"{self.url}{annotation['id']}/"
        assert self.client.get(self.url).status_code == read_status
        assert self.client.get(detail_url).status_code == read_status
        assert self.client.post(self.url, {"variant_key": "test", "content": "Note"}).status_code == 403
        assert self.client.patch(detail_url, {"content": "Changed"}).status_code == 403
        assert self.client.delete(detail_url).status_code == 403
