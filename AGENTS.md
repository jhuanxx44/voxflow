# VoxFlow agent and contributor guidance

This is the canonical repository guidance for coding agents and contributors. `CLAUDE.md` points
to this file; keep shared instructions here instead of maintaining tool-specific copies.

## Product boundary

VoxFlow is a deterministic, local-first audio/video editing engine with CLI, stdio MCP, and React
Web adapters. An external agent interprets editorial intent. VoxFlow owns validation, stable IDs,
revisions, persistence, jobs, rendering, and artifacts.

Keep model reasoning outside the deterministic editing core. Do not add hidden fuzzy mutations or
make CLI, MCP, and Web behave as separate editors.

## Authoritative architecture

- `voxflow/domain/`: stable IDs, models, Edit Plan operations, and pure validation/reducer rules.
- `voxflow/application/`: project, transcript, edit, export, speech, job, diagnostics, maintenance,
  and companion-skill use cases.
- `voxflow/infrastructure/`: persistence, catalog, providers, caches, FFmpeg, and telemetry.
- `voxflow/interfaces/`: bounded CLI, MCP, and versioned Web adapters.
- `src/`: React adapter; route core editing requests through `src/services/projectService.ts`.
- `legacy_web/`: deprecated compatibility surface. Do not add editing features here.
- `app.py`: Web composition root, not a business-logic layer.

Do not import Flask, Typer, MCP, React, provider SDKs, or legacy Web code into `voxflow/domain/`.
Do not import interface layers into `voxflow/application/`. MCP must not shell out to the CLI, and
Web must not maintain a second reducer. Run `make architecture-audit` after changing dependency
direction or moving modules.

## Environment and dependencies

Use Python 3.11, uv, Node.js 20+, and FFmpeg/ffprobe. Treat `pyproject.toml` and `uv.lock` as the
Python dependency authorities and `package-lock.json` as the frontend authority.

```bash
make sync
npm ci
```

Do not add a second requirements file or recommend ad-hoc `pip install` / `npm install` commands.
Use `./start.sh` for the locked local Web stack. See `docs/INSTALLATION.md` for complete setup and
troubleshooting.

## Working method

- Inspect the relevant contract, schema, and tests before changing behavior.
- Preserve unrelated changes and untracked files in a dirty worktree.
- Put business rules in domain/application code, then expose them through thin adapters.
- Add tests at the lowest useful layer. Update contract snapshots and committed schemas when their
  authoritative models change.
- Treat build success as separate from runtime evidence. Exercise changed Web behavior in a real
  browser and changed CLI/MCP workflows through their public interface.
- Update only the architecture, installation, security, or release documentation affected by the
  change; do not duplicate those documents here.

## Editing protocol invariants

- Read the current transcript/timeline and mutate stable `clip_*` / `tok_*` IDs, never fuzzy text
  matches or array positions.
- Include the current `expected_revision` and a unique idempotency key in every write plan.
- Run the same validator/reducer for preview and apply; preview must never mutate state.
- Commit all operations in a plan atomically. A failed plan creates no revision.
- Preserve immutable history. Undo creates a new revision from old content.
- Keep media bytes out of MCP structured content and model context.
- Run ASR, TTS, and export as persistent jobs; expose completed outputs as artifacts.
- Preserve source media unless the user explicitly authorizes a destructive operation.

## Companion skill

Treat `skills/voxflow/` as the canonical source for the published `voxflow` companion
skill for Codex and Claude Code. Use it for user requests to import, transcribe, inspect, edit,
replace speech in, or export local media through VoxFlow.

Keep the skill synchronized whenever public CLI commands, MCP tools, schema versions, Edit Plan
operations, job behavior, or safety boundaries change. Preserve its bounded-read, stable-ID,
current-revision, preview-before-apply, and source-media rules. Treat `agents/openai.yaml` as
optional Codex UI metadata; Claude consumes the shared `SKILL.md`. Do not edit installed copies
under `~/.codex/skills/voxflow` or `~/.claude/skills/voxflow` as the source of truth.

After changing the skill or its installer:

```bash
make skill-check
uv run pytest tests/unit/test_companion_skill.py tests/contract/test_cli.py
uv build --wheel
```

The build hook in `setup.py` copies this canonical directory into the wheel; do not keep a second
source copy under the Python package. Verify the built wheel from outside the repository when
changing package data, installation paths, or release behavior.

## Verification

Run checks in proportion to the change, and run the complete relevant gate before handoff:

```bash
make check
npx tsc --noEmit
npm run build
npm run test:e2e
```

- Python/domain/application/CLI/MCP changes: run `make check` plus the relevant smoke workflow.
- React or Web adapter changes: run TypeScript, production build, and targeted Playwright evidence.
- Architecture changes: run `make architecture-audit` and review `docs/ARCHITECTURE.md`.
- Packaging/release changes: build a wheel and perform a fresh installation outside the repository.

Keep secrets, credentials, user media, transcripts, generated results, and runtime data out of
source control. Never expose the unauthenticated local Web server to the public internet by default.

Useful references: `README.md`, `docs/ARCHITECTURE.md`, `STORE_ARCHITECTURE.md`,
`docs/CLI_MCP_IMPLEMENTATION_PLAN.md`, `docs/V1_RELEASE_TEST_REPORT.md`, `docs/INSTALLATION.md`,
`SECURITY.md`, and `THIRD_PARTY_NOTICES.md`.
