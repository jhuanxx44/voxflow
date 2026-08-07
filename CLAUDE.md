# Contributor guidance

VoxFlow is a deterministic local audio/video editing engine with CLI, stdio MCP, and React Web
adapters. Codex/Claude or another agent interprets intent; VoxFlow owns validation, revisions,
persistence, jobs, rendering, and artifacts.

## Authoritative architecture

- `voxflow/domain/`: stable IDs, models, Edit Plan operations, pure validation/reducer rules.
- `voxflow/application/`: project, transcript, edit, export, speech, job, diagnostics use cases.
- `voxflow/infrastructure/`: project store, catalog, providers, caches, FFmpeg and telemetry.
- `voxflow/interfaces/`: CLI, MCP, and versioned Web adapters.
- `src/`: React adapter. Core editing requests go through `src/services/projectService.ts`.
- `legacy_web/`: deprecated repository-only compatibility endpoints. Do not add editing features
  here; see the Sunset policy in `docs/ARCHITECTURE.md`.
- `app.py`: Web composition root, not a business-logic layer.

Domain must not import Flask, Typer, MCP, React, providers, or legacy Web code. MCP must not invoke
the CLI, and Web must not maintain a separate reducer. Run `make architecture-audit` after moving
modules or changing dependency direction.

## Environment and commands

Use Python 3.11, uv, Node.js 20+, and FFmpeg/ffprobe.

```bash
make sync
npm ci
make check
npx tsc --noEmit
npm run build
npx playwright install chromium
npm run test:e2e
```

`./start.sh` starts the local Web backend and Vite frontend from locked dependencies. Do not add a
second requirements file or recommend ad-hoc pip/npm installs. Full setup and troubleshooting are
in `docs/INSTALLATION.md`.

## Editing protocol invariants

- Read current transcript/timeline and use stable `clip_*` / `tok_*` IDs.
- Write operations carry `expected_revision` and a unique idempotency key.
- Preview and apply use the same validator/reducer; preview never mutates state.
- A failed multi-operation plan creates no revision.
- Undo creates a new revision from old content; history is immutable.
- MCP structured content never contains media bytes.
- ASR/TTS/export use persistent jobs; completed outputs are artifacts.

## Change discipline

- Preserve unrelated work in a dirty tree.
- Add tests at the lowest useful layer and update protocol/schema snapshots when contracts change.
- UI build success is not browser regression; Web changes require Playwright or documented real
  browser evidence.
- Never expose the local unauthenticated Web server to the public internet by default.
- Keep secrets and user media/results out of source control; run the public repository audit.
- Update the relevant architecture, installation, security, or test document when behavior changes.

Useful references: `README.md`, `docs/ARCHITECTURE.md`, `STORE_ARCHITECTURE.md`,
`docs/CLI_MCP_IMPLEMENTATION_PLAN.md`, `docs/V1_RELEASE_TEST_REPORT.md`, and `SECURITY.md`.
