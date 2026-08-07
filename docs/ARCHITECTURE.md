# Architecture and compatibility boundaries

VoxFlow has one authoritative editing engine and three adapters. Business rules do not live in
Flask, React, CLI commands, or MCP tools.

```text
Codex / Claude / scripts       React Web
          │                        │
      MCP or CLI              versioned /api/v1
          └──────────┬─────────────┘
                     ▼
            voxflow/application
                     ▼
              voxflow/domain
                     ▼
          voxflow/infrastructure
        project store · jobs · FFmpeg
```

## Authoritative modules

- `voxflow/domain/`: schemas, stable IDs, edit operations, validation, and pure timeline rules. It
  must not import Flask, Typer, MCP, React, or provider SDKs.
- `voxflow/application/`: project, transcript, edit, export, speech, job, diagnostics, and
  maintenance use cases. All adapters call this layer directly.
- `voxflow/infrastructure/`: filesystem/SQLite persistence, provider boundaries, caches, telemetry,
  media probing, and FFmpeg rendering.
- `voxflow/interfaces/cli/`, `voxflow/interfaces/mcp/`, `voxflow/interfaces/web/`: bounded protocol
  adapters. MCP does not shell out to the CLI, and Web does not implement a second reducer.
- `src/services/projectService.ts`: the React editor's authoritative project/edit/job/export API
  client. `src/stores/editorStore.ts` contains view state and hydrated revision data, not a second
  persistent project model.

`app.py` is only the repository Web composition root. `config.py` and `utils/llm.py` exist for the
compatibility Web/provider surface and are not dependencies of the domain or CLI/MCP engine.

## Deprecated Web compatibility package

`legacy_web/` contains the original `/asr`, `/export-media`, `/tts`, `/chat`, `/materials`, and
related helper endpoints. It remains because optional chat/material-library UI pieces have not all
been migrated to versioned application services. It is repository-only and is not included in the
VoxFlow Python wheel.

Every response from these blueprints includes:

- `Deprecation: true`
- `Sunset: Thu, 31 Dec 2026 23:59:59 GMT`
- a `Link` to this document, plus a successor link where a v1 endpoint exists

The compatibility package will not be removed before that date. New editing features must use
`/api/v1`, CLI, or MCP and must not add behavior to `legacy_web/`. Before removal, remaining
materials/chat provider UI must either move behind explicit versioned extension APIs or be split
into a separate plugin.

## Frontend and assets

The only tracked Web application is the root Vite app (`index.html`, `src/`, `vite.config.js`). The
old generated `static/index.html` and unused legacy ASR/export/TTS TypeScript clients were removed;
generated `dist/`, local `frontend/`, `.e2e/`, and test reports are ignored build/runtime output.

## Dependency direction checks

Code review and CI should preserve these rules:

1. Domain imports only the standard library, Pydantic models, and other domain modules.
2. Application may depend on domain and declared infrastructure interfaces, never an adapter.
3. CLI, MCP, Web, and providers translate protocols; they do not duplicate edit validation.
4. Media bytes stay outside MCP structured content. Adapters exchange IDs, bounded metadata, and
   artifact references.
5. Any compatibility code must have an owner, a documented successor or removal decision, and a
   concrete sunset date.
