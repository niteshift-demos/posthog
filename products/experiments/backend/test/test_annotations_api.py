from types import SimpleNamespace

from posthog.test.base import APIBaseTest

from django.test import SimpleTestCase

from parameterized import parameterized

from posthog.constants import AvailableFeature
from posthog.models import Team
from posthog.models.organization import OrganizationMembership

from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_annotation import ExperimentAnnotation
from products.experiments.backend.presentation.annotations import ExperimentAnnotationSerializer
from products.feature_flags.backend.models.feature_flag import FeatureFlag

from ee.models.rbac.access_control import AccessControl


class TestExperimentAnnotationValidation(SimpleTestCase):
    @parameterized.expand(
        [
            ({"variant_key": "other", "content": "A note"}, "variant_key"),
            ({"variant_key": "test", "content": "   "}, "content"),
            ({"variant_key": "test", "content": "a" * 8193}, "content"),
        ]
    )
    def test_invalid_annotation(self, data: dict[str, str], field: str) -> None:
        experiment = SimpleNamespace(feature_flag=SimpleNamespace(variants=[{"key": "control"}, {"key": "test"}]))
        serializer = ExperimentAnnotationSerializer(data=data, context={"experiment": experiment})
        assert not serializer.is_valid()
        assert field in serializer.errors


class TestExperimentAnnotationsAPI(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        flag = FeatureFlag.objects.create(
            team=self.team,
            key="annotation-experiment",
            filters={"multivariate": {"variants": [{"key": "control"}, {"key": "test"}]}},
        )
        self.experiment = Experiment.objects.create(team=self.team, name="Annotation experiment", feature_flag=flag)
        self.url = f"/api/projects/{self.team.id}/experiments/{self.experiment.id}/annotations/"

    def test_annotation_lifecycle_preserves_author_and_conclusion(self) -> None:
        self.experiment.conclusion = "inconclusive"
        self.experiment.conclusion_comment = "Recorded conclusion"
        self.experiment.save()
        response = self.client.post(
            self.url,
            {"variant_key": "test", "content": "Shipped after reviewing the results", "created_by": None},
        )
        assert response.status_code == 201, response.json()
        annotation_id = response.json()["id"]
        assert response.json()["created_by"]["id"] == self.user.id
        assert response.json()["experiment"] == self.experiment.id
        assert response.json()["created_at"]
        assert response.json()["updated_at"]

        response = self.client.get(self.url)
        assert response.status_code == 200
        assert response.json()[0]["content"] == "Shipped after reviewing the results"
        assert response.json()[0]["variant_key"] == "test"

        detail_url = f"{self.url}{annotation_id}/"
        response = self.client.patch(detail_url, {"content": "Updated note", "created_by": None})
        assert response.status_code == 200, response.json()
        assert response.json()["content"] == "Updated note"
        assert response.json()["created_by"]["id"] == self.user.id
        self.experiment.refresh_from_db()
        assert self.experiment.conclusion == "inconclusive"
        assert self.experiment.conclusion_comment == "Recorded conclusion"

        assert self.client.delete(detail_url).status_code == 204
        assert self.client.get(self.url).json() == []
        assert not ExperimentAnnotation.objects.for_team(self.team.id).filter(id=annotation_id).exists()

    def test_invalid_variant_is_rejected_on_create_and_edit(self) -> None:
        response = self.client.post(self.url, {"variant_key": "missing", "content": "A note"})
        assert response.status_code == 400
        assert not ExperimentAnnotation.objects.for_team(self.team.id).exists()
        annotation = ExperimentAnnotation.objects.for_team(self.team.id).create(
            team=self.team,
            experiment=self.experiment,
            variant_key="test",
            content="Original note",
            created_by=self.user,
        )
        response = self.client.patch(f"{self.url}{annotation.id}/", {"variant_key": "missing"})
        assert response.status_code == 400
        annotation.refresh_from_db()
        assert annotation.variant_key == "test"

    @parameterized.expand([("get", False), ("get", True), ("post", False), ("patch", True), ("delete", True)])
    def test_cross_project_access(self, method: str, detail: bool) -> None:
        other_team = Team.objects.create(organization=self.organization, name="Another project")
        annotation = ExperimentAnnotation.objects.for_team(self.team.id).create(
            team=self.team, experiment=self.experiment, variant_key="test", content="Private note", created_by=self.user
        )
        url = f"/api/projects/{other_team.id}/experiments/{self.experiment.id}/annotations/"
        if detail:
            url += f"{annotation.id}/"
        response = getattr(self.client, method)(url, {"variant_key": "test", "content": "Changed"})
        assert response.status_code == 404, response.json()
        annotation.refresh_from_db()
        assert annotation.content == "Private note"
        assert ExperimentAnnotation.objects.for_team(self.team.id).count() == 1

    def test_annotation_cannot_be_accessed_through_another_experiment(self) -> None:
        other_experiment = Experiment.objects.create(
            team=self.team, name="Other experiment", feature_flag=self.experiment.feature_flag
        )
        annotation = ExperimentAnnotation.objects.for_team(self.team.id).create(
            team=self.team, experiment=self.experiment, variant_key="test", content="A note", created_by=self.user
        )
        url = f"/api/projects/{self.team.id}/experiments/{other_experiment.id}/annotations/"
        assert self.client.get(url).json() == []
        assert self.client.patch(f"{url}{annotation.id}/", {"content": "Changed"}).status_code == 404

    @parameterized.expand([("none", 403), ("viewer", 200)])
    def test_experiment_object_permissions(self, access_level: str, read_status: int) -> None:
        self.organization.available_product_features = [
            {"key": AvailableFeature.ACCESS_CONTROL, "name": AvailableFeature.ACCESS_CONTROL}
        ]
        self.organization.save()
        self.organization_membership.level = OrganizationMembership.Level.MEMBER
        self.organization_membership.save()
        AccessControl.objects.create(
            team=self.team, resource="experiment", resource_id=str(self.experiment.id), access_level=access_level
        )
        assert self.client.get(self.url).status_code == read_status
        assert self.client.post(self.url, {"variant_key": "test", "content": "A note"}).status_code == 403
