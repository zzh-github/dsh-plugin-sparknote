# Reading Collection development plan

Build a shareable DSH bundle for highlighting completed replies before collecting them.

1. Package a Host plugin, browser plugin, and profile patch in one independently installable npm package.
2. Store message snapshots and text anchors in a versioned Harness storage domain. Serialize mutations and retain unsaved highlights across restarts.
3. Add collection actions through Chat slots. Paint highlights with the CSS Custom Highlight API without changing the rendered Markdown. Keep DOM integration isolated and test its selectors against the supported DSH release.
4. Add a searchable collection panel with editable titles, saved Markdown, highlight editing, and source-session navigation. Removing a collection preserves its highlight draft.
5. Validate anchor ambiguity, concurrent changes, storage failures, unload cleanup, browser selection, reload persistence, themes, and the packed installation. Deliver a tarball and bilingual usage instructions.

Acceptance: select text in an original completed reply, apply several colors, reload, collect it, open its saved copy, edit a highlight, and find the same changes in the original reply. Saved text remains readable after deleting its source session.
