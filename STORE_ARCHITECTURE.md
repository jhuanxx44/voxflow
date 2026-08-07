# React store architecture

The persistent source of truth is the VoxFlow project store, not Zustand or localStorage. React
hydrates a bounded editor snapshot from `/api/v1` and submits every committed edit with the current
project revision.

## Stores

| Store | Responsibility | Not authoritative for |
|---|---|---|
| `editorStore` | hydrated transcript/timeline view, current revision, draft composition, speaker/display state, undo/redo UI | manifests, revision history, artifacts |
| `asrStore` | selected local file/material, media URL/type, recognition progress, hotwords, server status | completed transcript or job state |
| `uiStore` | theme, menus, modals, debug visibility | media or editing data |

`src/services/projectService.ts` is the only React client for project creation, transcript jobs,
timeline reads, edit preview/apply/restore, speech candidates, search, and export artifacts. The old
`asrService.ts`, `exportService.ts`, and `ttsService.ts` clients were removed after the v1 migration.

## Commit flow

```text
user gesture
  → hook/store resolves stable clip_* or tok_* ID
  → POST /api/v1/.../edits with expected_revision
  → application reducer validates and atomically creates revision N+1
  → React reloads project + transcript + timeline snapshot
  → local view state reflects committed revision
```

If another adapter commits first, the API returns `REVISION_CONFLICT`; the store reloads rather than
silently replaying a positional mutation. Undo/redo use the restore API and create new revisions.
localStorage contains only the last project pointer and UI preferences, so clearing browser storage
does not delete projects or committed edits.

## Rules for changes

1. Never introduce a second persistent timeline representation in React.
2. External operations use stable IDs; array indexes are render-only positions.
3. Display-mode changes must not call reset or create a revision.
4. Long operations use persistent jobs and artifact IDs, not browser-only Blob state.
5. Add editing behavior to domain/application first, then expose it through all required adapters.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for repository-wide dependency boundaries.
