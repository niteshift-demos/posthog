from typing import Any

from posthog.test.base import APIBaseTest

from parameterized import parameterized

from posthog.models import Organization, Team
from posthog.models.personal_api_key import PersonalAPIKey, hash_key_value

from products.experiments.backend.models.experiment import Experiment, ExperimentAnnotation
from products.feature_flags.backend.models.feature_flag import FeatureFlag


class TestExperimentAnnotations(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        flag = FeatureFlag.objects.create(
            team=self.team,
            key="annotation-test",
            filters={"multivariate": {"variants": [{"key": "control"}, {"key": "test"}]}},
        )
        self.experiment = Experiment.objects.create(
            team=self.team,
            name="Annotation test",
            feature_flag=flag,
            conclusion="won",
            conclusion_comment="Recorded conclusion",
        )
        self.url = f"/api/projects/{self.team.id}/experiments/{self.experiment.id}/annotations/"

    def test_annotation_lifecycle_preserves_author_and_conclusion(self) -> None:
        response = self.client.post(
            self.url,
            {"variant_key": "test", "content": "Shipped after reviewing results.", "created_by": 123},
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["created_at"], body["updated_at"])
        annotation = ExperimentAnnotation.objects.for_team(self.team.id).get(pk=body["id"])
        self.assertEqual(annotation.experiment_id, self.experiment.id)
        self.assertEqual(annotation.created_by_id, self.user.id)
        self.assertEqual(annotation.content, "Shipped after reviewing results.")
        self.assertEqual(self.client.get(self.url).json(), [body])

        detail_url = f"{self.url}{annotation.id}/"
        response = self.client.patch(detail_url, {"content": "Updated note.", "variant_key": "control"})
        self.assertEqual(response.status_code, 200, response.content)
        annotation.refresh_from_db()
        self.assertEqual(annotation.content, "Updated note.")
        self.assertEqual(annotation.variant_key, "control")
        self.assertEqual(response.json()["created_at"], body["created_at"])
        self.assertEqual(response.json()["created_by"], body["created_by"])
        self.assertGreaterEqual(response.json()["updated_at"], body["updated_at"])
        self.experiment.refresh_from_db()
        self.assertEqual(self.experiment.conclusion, "won")
        self.assertEqual(self.experiment.conclusion_comment, "Recorded conclusion")

        self.assertEqual(self.client.delete(detail_url).status_code, 204)
        self.assertEqual(self.client.get(self.url).json(), [])
        self.assertFalse(ExperimentAnnotation.objects.for_team(self.team.id).filter(pk=annotation.id).exists())
        self.assertEqual(self.client.patch(detail_url, {"content": "Gone"}).status_code, 404)

    @parameterized.expand(
        [
            ("unknown_variant", {"variant_key": "another-experiment-variant", "content": "A note"}),
            ("blank_note", {"variant_key": "test", "content": "   "}),
            ("missing_variant", {"content": "A note"}),
            ("oversized_note", {"variant_key": "test", "content": "x" * 8193}),
        ]
    )
    def test_rejects_invalid_input(self, _name: str, payload: dict[str, Any]) -> None:
        response = self.client.post(self.url, payload)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(ExperimentAnnotation.objects.for_team(self.team.id).count(), 0)

    def test_rejects_invalid_variant_on_edit(self) -> None:
        annotation = ExperimentAnnotation.objects.for_team(self.team.id).create(
            team=self.team, experiment=self.experiment, variant_key="test", content="Original", created_by=self.user
        )
        response = self.client.patch(f"{self.url}{annotation.id}/", {"variant_key": "unknown", "content": "Edited"})
        self.assertEqual(response.status_code, 400, response.content)
        annotation.refresh_from_db()
        self.assertEqual(annotation.content, "Original")

    def test_cannot_access_another_projects_experiment_or_annotation(self) -> None:
        other_team = Team.objects.create(organization=self.organization, name="Other project")
        other_flag = FeatureFlag.objects.create(team=other_team, key="other-flag")
        other_experiment = Experiment.objects.create(team=other_team, name="Other experiment", feature_flag=other_flag)
        annotation = ExperimentAnnotation.objects.for_team(other_team.id).create(
            team=other_team, experiment=other_experiment, variant_key="control", content="Other project note"
        )
        wrong_project_url = f"/api/projects/{self.team.id}/experiments/{other_experiment.id}/annotations/"
        for method, url, payload in [
            ("get", wrong_project_url, {}),
            ("post", wrong_project_url, {"variant_key": "control", "content": "Denied"}),
            ("patch", f"{self.url}{annotation.id}/", {"content": "Denied"}),
            ("delete", f"{self.url}{annotation.id}/", {}),
        ]:
            response = getattr(self.client, method)(url, payload)
            self.assertEqual(response.status_code, 404, response.content)
        annotation.refresh_from_db()
        self.assertEqual(annotation.content, "Other project note")

    def test_read_only_api_key_cannot_mutate_annotations(self) -> None:
        annotation = ExperimentAnnotation.objects.for_team(self.team.id).create(
            team=self.team, experiment=self.experiment, variant_key="test", content="Original", created_by=self.user
        )
        value = "phx_experiment_annotation_read_only_test_key"
        PersonalAPIKey.objects.create(
            label="Annotations read only",
            user=self.user,
            secure_value=hash_key_value(value),
            scopes=["experiment:read"],
        )
        self.client.logout()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {value}")
        self.assertEqual(self.client.get(self.url).status_code, 200)
        for method, url in [
            ("post", self.url),
            ("patch", f"{self.url}{annotation.id}/"),
            ("delete", f"{self.url}{annotation.id}/"),
        ]:
            response = getattr(self.client, method)(url, {"variant_key": "test", "content": "Denied"})
            self.assertEqual(response.status_code, 403, response.content)
        annotation.refresh_from_db()
        self.assertEqual(annotation.content, "Original")

    def test_cannot_read_or_write_an_inaccessible_project(self) -> None:
        organization = Organization.objects.create(name="Separate organization")
        team = Team.objects.create(organization=organization, name="Private project")
        flag = FeatureFlag.objects.create(team=team, key="private-flag")
        experiment = Experiment.objects.create(team=team, name="Private experiment", feature_flag=flag)
        url = f"/api/projects/{team.id}/experiments/{experiment.id}/annotations/"
        self.assertEqual(self.client.get(url).status_code, 403)
        response = self.client.post(url, {"variant_key": "control", "content": "Denied"})
        self.assertEqual(response.status_code, 403, response.content)
        self.assertEqual(ExperimentAnnotation.objects.for_team(team.id).count(), 0)
