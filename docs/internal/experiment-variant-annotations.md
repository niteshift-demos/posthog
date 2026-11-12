# Experiment variant annotations

Open an experiment's results and use **Variant annotations** to select a variant and add a note. Each note shows its author and creation time. Edit a note to correct its text or selected variant; edited notes also show their update time. Delete a note to remove it permanently.

Annotations are separate from the experiment's recorded conclusion and conclusion comment. Adding, editing, or deleting an annotation does not ship a variant or change experiment results.

## API

All routes are scoped to the project and experiment:

| Method | Route                                                                      | Behavior                  |
| ------ | -------------------------------------------------------------------------- | ------------------------- |
| GET    | `/api/projects/{project_id}/experiments/{id}/annotations/`                 | List notes, newest first  |
| POST   | `/api/projects/{project_id}/experiments/{id}/annotations/`                 | Create a note             |
| PATCH  | `/api/projects/{project_id}/experiments/{id}/annotations/{annotation_id}/` | Edit a note               |
| DELETE | `/api/projects/{project_id}/experiments/{id}/annotations/{annotation_id}/` | Permanently delete a note |

Create requests require `variant_key` and nonblank `content` of at most 8,192 characters. Partial updates accept either field. The selected variant must exist on the experiment's linked feature flag. Reads return `id`, `variant_key`, `content`, `created_by`, `created_at`, and `updated_at`. The server assigns the author and timestamps; clients cannot overwrite them.

Reading requires experiment read access; creating, editing, and deleting require experiment write access. These permissions apply to the experiment object as well as the project. Project members with write access can edit or delete notes from other authors. A note ID from another experiment or project returns 404.

## Persistence and deployment

Migration `experiments.0033_experiment_annotation` creates a separate, team-scoped annotation table in Postgres. It adds no analytics seed data and changes no existing experiment columns. Annotations cascade when their experiment is deleted. Deleted users leave their notes with an unavailable author.

The API reuses the experiment viewset's project and object permission checks and the shared user serializer. The existing general annotations target timeline markers, while comments use loose resource identifiers; neither can enforce an experiment relationship and variant validation without an experiment-specific API.

Apply the additive Django migration before deploying application code that reads annotations. The team and author relations use application-level constraints to avoid locking the hot team and user tables during migration.
