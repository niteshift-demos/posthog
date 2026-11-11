# Experiment variant notes

The Metrics tab of an experiment supports notes on individual variants. Only the note's author can edit or delete it.

The experiment's History tab records when someone adds, edits, or deletes a note. Each entry identifies the author, variant, and note text. Edits show the previous and updated variant keys and text. Expand an entry to inspect its structured diff. Deleting a note removes it from Metrics while keeping its history.

Activity entries use scope `Experiment`, the parent experiment ID as `item_id`, and activities `variant_annotation_created`, `variant_annotation_updated`, and `variant_annotation_deleted`. The `variant_annotation` change stores the note ID, variant key, and content before and after the operation. Saving unchanged content and variant does not add an entry.
