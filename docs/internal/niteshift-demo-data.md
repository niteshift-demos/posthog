# Niteshift demo annotations

Niteshift setup adds 12 fictional annotations to the Hedgebox demo project after
the demo account and its dashboards and insights exist. These notes make the
annotations list and chart markers available in new environments.

The seed definitions live in `.niteshift/files/annotations.json`. They include
five project annotations, four dashboard annotations, and three insight
annotations. Every note starts with `[Demo]` and describes an invented release,
experiment, campaign, or incident.

The seed script finds the demo account by email and its project by the fixed
local demo token assigned by `generate_demo_data`. It resolves dashboards and
insights by name rather than database ID. New notes receive dates between two
and twenty days before setup runs, at noon UTC.

Setup can run repeatedly. The script matches existing annotations by project and
content and only creates missing notes. It preserves existing dates, edits to
other fields, and soft-deletion choices. Changing a seed's content creates a new
note on the next setup run. Unrelated annotations remain unchanged.

To add a note, add an entry to the JSON file with `content`, `scope`, `emoji`, and
`days_ago`. Dashboard notes also require `dashboard_name`; insight notes require
`insight_name`. Referenced resources must exist in the Hedgebox demo project.
