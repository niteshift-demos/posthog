# Experiment variant annotations

Variant annotations record notes on individual experiment variants. They do not change the experiment's conclusion.

Annotations use the parent experiment's access controls. Viewers can read notes; editor access is required to create, edit, or delete them.

| Note                     | Who can edit | Who can delete                                                  |
| ------------------------ | ------------ | --------------------------------------------------------------- |
| Your note                | You          | You, organization admins and owners, experiment managers        |
| Someone else's note      | Its author   | Its author, organization admins and owners, experiment managers |
| Note from a deleted user | Nobody       | Anyone with editor access                                       |

Experiment manager access applies when the organization's access-control feature is available. A user leaving an organization does not remove the note's author attribution. Admins and experiment managers can still delete the note.

The API at `/api/projects/{project_id}/experiments/{experiment_id}/variant_annotations/` returns read-only `can_edit` and `can_delete` fields for the current user. The frontend uses these fields to show each note's available actions. The server enforces the same rules on `PATCH`, `PUT`, and `DELETE` requests.

Moderation permits deletion so an administrator can remove inappropriate or incorrect notes without rewriting another person's words. Notes from deleted users allow editor cleanup because their authors can no longer maintain them.
