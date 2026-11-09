# Experiment variant annotations

Experiment results include a **Variant annotations** panel. Select a variant,
write a note, and choose **Add annotation**. Notes display the variant, author,
and creation time. Edited notes display an edited marker. Project members with
edit access to the experiment can edit or delete notes; viewers can read them.

Annotations remain separate from the experiment's recorded conclusion. Adding,
editing, or deleting an annotation does not conclude the experiment or change
its result calculations.

## API

Annotations belong to one project and experiment:

- `GET /api/projects/{project_id}/experiments/{experiment_id}/annotations/`
- `POST /api/projects/{project_id}/experiments/{experiment_id}/annotations/`
- `GET /api/projects/{project_id}/experiments/{experiment_id}/annotations/{id}/`
- `PATCH /api/projects/{project_id}/experiments/{experiment_id}/annotations/{id}/`
- `DELETE /api/projects/{project_id}/experiments/{experiment_id}/annotations/{id}/`

Create requests accept `variant_key` and `content`. Patch requests accept either
field. The variant key must belong to the experiment's feature flag. Content
must contain non-whitespace text and cannot exceed 10,000 characters.

The server sets the project, experiment, author, and timestamps. Responses
include `id`, `variant_key`, `content`, `created_by`, `created_at`, and
`updated_at`. The list endpoint returns an array, newest first. Delete removes
the annotation permanently.

## Storage and services

The experiments Django app owns the annotation model and migration. The API
uses the experiment's access controls and scopes annotation queries to the
project and experiment. The frontend uses the generated experiment API client
and a kea logic to load and mutate annotations.

The Django web service reads and writes Postgres directly for this feature.
Annotation operations do not require ClickHouse, ingestion workers, Celery,
or Temporal, and they do not change analytics seed data.
