# VoxFlow roadmap

VoxFlow 1.0 provides a deterministic local media-editing engine shared by the
CLI, MCP server, and React Web application. The current architecture, stable
edit protocol, persistent revisions, background jobs, and release gates are
documented in the repository rather than in private execution logs.

## Shipped in 1.0

- Stable project, transcript, timeline, revision, job, and artifact schemas.
- Preview-first edit plans with revision checks and idempotency.
- MP4, MP3, WAV, SRT, and VTT export through FFmpeg.
- Shared application behavior across CLI, MCP, and Web adapters.
- Persistent speech-replacement candidates and reversible application.
- Deterministic unit, contract, integration, property, and browser regression
  coverage on macOS and Linux.

## Near-term work

- Improve reference-audio selection and quality scoring for speech replacement.
- Add reference text, contextual prosody controls, and reproducible candidate
  metadata to the speech-provider contract.
- Evaluate local-first Chinese speech models with a shared listening protocol.
- Add loudness matching, short crossfades, and boundary-noise continuity checks.
- Continue removing the deprecated Web compatibility layer before its documented
  sunset date.

## Contribution priorities

Changes should preserve stable IDs, preview/apply equivalence, immutable history,
and the local-only default network boundary. See `CLAUDE.md`,
`docs/ARCHITECTURE.md`, and `docs/CLI_MCP_IMPLEMENTATION_PLAN.md` before changing
protocol or dependency direction.
