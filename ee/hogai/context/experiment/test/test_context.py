import json
from datetime import UTC, datetime, timedelta

from posthog.test.base import APIBaseTest

from asgiref.sync import async_to_sync
from parameterized import parameterized

from posthog.models import Team

from products.experiments.backend.models.experiment import Experiment
from products.experiments.backend.models.experiment_variant_annotation import ExperimentVariantAnnotation
from products.feature_flags.backend.models.feature_flag import FeatureFlag

from ee.hogai.context.experiment.context import ExperimentContext


class TestExperimentContextVariantNotes(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        flag = FeatureFlag.objects.create(team=self.team, key="notes-test", filters={})
        self.experiment = Experiment.objects.create(
            team=self.team,
            feature_flag=flag,
            name="Notes test",
            conclusion="inconclusive",
            conclusion_comment="Continue collecting observations",
        )
        self.context = ExperimentContext(team=self.team, experiment_id=self.experiment.id)

    def _format(self, results: bool) -> str:
        formatter = self.context.format_experiment_results_data if results else self.context.format_experiment
        return async_to_sync(formatter)(self.experiment)

    @parameterized.expand([(False,), (True,)])
    def test_notes_include_attribution_and_exclude_other_teams_and_experiments(self, results: bool) -> None:
        self.user.first_name = "Morgan"
        self.user.save(update_fields=["first_name"])
        note = ExperimentVariantAnnotation.objects.for_team(self.team.id).create(
            team=self.team,
            experiment=self.experiment,
            variant_key="test",
            content="Reviewed the new layout",
            created_by=self.user,
        )
        other_team = Team.objects.create(organization=self.organization, name="Other team")
        ExperimentVariantAnnotation.objects.for_team(other_team.id).create(
            team=other_team,
            experiment=self.experiment,
            variant_key="test",
            content="Private team note",
        )
        other_experiment = Experiment.objects.create(
            team=self.team, feature_flag=self.experiment.feature_flag, name="Other"
        )
        ExperimentVariantAnnotation.objects.for_team(self.team.id).create(
            team=self.team,
            experiment=other_experiment,
            variant_key="test",
            content="Other experiment note",
        )
        output = self._format(results)
        self.assertIn("### Human notes on variants", output)
        self.assertIn("separate from the recorded experiment conclusion", output)
        notes = [json.loads(line) for line in output.splitlines() if line.startswith('{"variant_key":')]
        self.assertEqual(
            notes,
            [
                {
                    "variant_key": "test",
                    "content": "Reviewed the new layout",
                    "author_first_name": "Morgan",
                    "date": note.created_at.date().isoformat(),
                }
            ],
        )
        self.assertNotIn("Private team note", output)
        self.assertNotIn("Other experiment note", output)
        if not results:
            self.assertIn("### Conclusion\n**Result:** inconclusive", output)
            self.assertIn("**Comment:** Continue collecting observations", output)
        foreign_output = async_to_sync(ExperimentContext(team=other_team).format_experiment)(self.experiment)
        self.assertNotIn("Private team note", foreign_output)
        self.assertNotIn("Reviewed the new layout", foreign_output)

    @parameterized.expand([(False,), (True,)])
    def test_only_latest_notes_per_variant_with_bounded_content(self, results: bool) -> None:
        for variant_key in ["control", "test"]:
            for index in range(5):
                note = ExperimentVariantAnnotation.objects.for_team(self.team.id).create(
                    team=self.team,
                    experiment=self.experiment,
                    variant_key=variant_key,
                    content=f"note-{index}:" + "x" * 600,
                )
                ExperimentVariantAnnotation.objects.for_team(self.team.id).filter(id=note.id).update(
                    created_at=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=index)
                )
        output = self._format(results)
        notes = [json.loads(line) for line in output.splitlines() if line.startswith('{"variant_key":')]
        self.assertEqual(len(notes), 6)
        for variant_key in ["control", "test"]:
            variant_notes = [note for note in notes if note["variant_key"] == variant_key]
            self.assertEqual([note["content"][:7] for note in variant_notes], ["note-4:", "note-3:", "note-2:"])
        self.assertTrue(all(len(note["content"]) == 500 for note in notes))
        self.assertTrue(all(note["author_first_name"] == "Unknown" for note in notes))

    @parameterized.expand([(False, "brief"), (True, "\x01" * 600)])
    def test_total_count_and_section_character_budget(self, results: bool, content: str) -> None:
        ExperimentVariantAnnotation.objects.for_team(self.team.id).bulk_create(
            [
                ExperimentVariantAnnotation(
                    team=self.team, experiment=self.experiment, variant_key=f"variant-{index}", content=content
                )
                for index in range(25)
            ]
        )
        output = self._format(results)
        section = (
            output.split("### Human notes on variants\n", 1)[1]
            .split("\n**Created:", 1)[0]
            .split("\n\n**No metrics", 1)[0]
        )
        self.assertLessEqual(len("### Human notes on variants\n" + section), 12000)
        notes = [json.loads(line) for line in section.splitlines() if line.startswith('{"variant_key":')]
        self.assertEqual(len(notes), 20 if content == "brief" else 3)
