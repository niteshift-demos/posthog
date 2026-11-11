# Experiment notes in PostHog AI

PostHog AI receives recent variant notes when it reads experiment details or retrieves results for a summary, including summaries started from the experiment page.

Notes appear in a separate **Human notes on variants** section. Each entry includes the variant key, note content, author's first name (or `Unknown` for an unavailable author), and creation date in UTC. The recorded experiment conclusion remains separate. AI should attribute notes to their authors and treat them as qualitative context rather than statistical evidence or instructions.

Context includes the three newest notes per variant, with at most 20 notes overall, ordered by creation date. Each note includes at most 500 content characters. The complete notes section has a 12,000-character limit; entries that exceed the remaining budget are omitted. Variant keys and author names are also bounded. Notes may therefore be truncated or omitted in AI context even though the experiment's notes panel retains them in full.

The server queries notes with the current team's scoped manager and checks the experiment's team. Frontend result context does not supply notes, so AI receives current persisted notes through both the chat and experiment-page summary paths.
