# Experiment variant annotations

The experiment results page shows a **Variant annotations** section. Select a
variant and add a note to record context such as a rollout decision. Each note
shows its variant, author, creation time, and whether it was edited. Notes persist
when the page reloads and can be edited or deleted from the same section.

Annotations are separate from the experiment's recorded conclusion. Adding,
editing, or deleting a note does not conclude the experiment or change its results.

## API

Annotations use a project-scoped endpoint nested under their experiment:

| Method   | Path                                                                       | Behavior                                      |
| -------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| `GET`    | `/api/projects/{project_id}/experiments/{experiment_id}/annotations/`      | List the experiment's annotations as an array |
| `POST`   | `/api/projects/{project_id}/experiments/{experiment_id}/annotations/`      | Create an annotation                          |
| `GET`    | `/api/projects/{project_id}/experiments/{experiment_id}/annotations/{id}/` | Read an annotation                            |
| `PATCH`  | `/api/projects/{project_id}/experiments/{experiment_id}/annotations/{id}/` | Edit the variant or content                   |
| `PUT`    | `/api/projects/{project_id}/experiments/{experiment_id}/annotations/{id}/` | Replace the variant and content               |
| `DELETE` | `/api/projects/{project_id}/experiments/{experiment_id}/annotations/{id}/` | Delete an annotation                          |

Create requests require `variant_key` and `content`:

```json
{
  "variant_key": "test",
  "content": "Shipped this variant after reviewing the results."
}
```

The variant key must belong to the experiment. Empty content is invalid. The
server derives the project, experiment, author, and timestamps from the request
context. Responses include `id`, `experiment`, `variant_key`, `content`,
`created_by`, `created_at`, and `updated_at`. The frontend API functions and types
are generated from the backend schema.

## Persistence and access

Experiment annotations belong to the experiments product and are stored in
Postgres. Every annotation has a project and experiment association. Requests
resolve both the experiment and annotation within the requested project, so an
annotation ID cannot grant access through another project or experiment URL.
Reading requires viewer access to the experiment. Creating, editing, and deleting
require editor access. API keys require the corresponding `experiment:read` or
`experiment:write` scope.

General chart annotations remain date markers, and general comments keep their
existing associations. Experiment annotations use dedicated persistence so every
write validates the selected experiment variant.
