# Variant annotations

Variant annotations record notes about an experiment's individual variants without changing its conclusion.
The panel loads the newest 20 notes first. Select **Load more** to append older notes.
A failed page leaves the loaded notes visible and offers another attempt.
Only a note's author can edit or delete it, with editor access to the experiment.

## API pagination

`GET /api/projects/:project_id/experiments/:experiment_id/variant_annotations/` returns
`count`, `results`, `next`, and `previous`. The default `limit` is 20, with a maximum of 100 per request.
Follow `next` until it is null to read all notes. `previous` is always null; refresh the first page to see new notes.

The opaque `cursor` in `next` records the last note's creation time and ID.
Notes sort by descending creation time, then descending ID to resolve timestamp ties.
Inserts and deletions before the cursor do not shift the next page, including when the boundary note is deleted.
Edits retain their position because creation time does not change.
Notes created after paging begins appear when the list refreshes; locally created notes appear immediately.

The panel preserves its cursor when notes are created, edited, or deleted.
It serializes page loads and local writes, and appends each ID only once.
