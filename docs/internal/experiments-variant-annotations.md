# Variant annotations

Variant annotations keep decisions next to an experiment's results without changing its conclusion.
Pick a variant, write a note, and choose **Add annotation**. Authors with editor access can edit or delete their notes.

Notes support Markdown links, lists, and emphasis. HTML is skipped and unsafe URL protocols are filtered by LemonMarkdown.
External images appear as links rather than loading automatically.

Type `@` and choose a teammate to mention them. Mentions are stored as `@member:<user_id>` in the Markdown string.
The 5,000-character limit includes Markdown syntax and mention tokens. The editor shows the stored length and blocks saving longer notes.

New mentions send in-app notifications through the same notification facade as discussions, subject to notification preferences and the real-time notifications flag.
Recipients must be active members with project access and experiment viewer access. Self-mentions, duplicates, code, and link destinations do not send notifications.
Editing a note only notifies teammates newly mentioned relative to its previous content. Removing and later re-adding a mention sends a new notification.
Notifications link to the experiment.
