# Experiment variant annotations

Variant annotations store notes alongside experiment results. Each note belongs to one experiment and one feature flag variant key. Notes stay separate from the experiment conclusion.

## MCP tools

Agents can use these tools in the active project:

| Tool                                   | Purpose                                      | Required scope     |
| -------------------------------------- | -------------------------------------------- | ------------------ |
| `experiment-variant-annotations-list`  | List notes across all variants, newest first | `experiment:read`  |
| `experiment-variant-annotation-create` | Add a note to a variant                      | `experiment:write` |
| `experiment-variant-annotation-update` | Edit a note's text or variant                | `experiment:write` |
| `experiment-variant-annotation-delete` | Permanently delete a note                    | `experiment:write` |

For a request such as "add a note on the test variant of experiment X":

1. Resolve the experiment ID with `experiment-list` or the finding-experiments skill.
2. Use `experiment-get` to check the linked feature flag's exact variant keys.
3. Call `experiment-variant-annotation-create` with `experiment_id`, `variant_key: "test"`, and `content`.

The text must contain between 1 and 5000 characters. Creation assigns the authenticated user as the author. Updates and deletes require both edit access to the parent experiment and authorship of the note.

To update or delete a note, list notes first and pass its UUID as `id`, along with its parent `experiment_id`. Updates use PATCH: send only the fields to change. Follow pagination when listing notes, and use each note's `variant_key` to select a variant's notes.

Retrieve and full replacement remain unavailable as MCP tools. Listing provides note IDs and contents, and partial updates preserve omitted fields.
