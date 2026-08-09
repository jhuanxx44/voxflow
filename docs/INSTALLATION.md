# Installation

VoxFlow supports Python 3.11 on macOS and Linux. FFmpeg and ffprobe must be available on `PATH`.
The Web UI additionally requires Node.js 20 or newer. Python dependencies are authoritative in
`pyproject.toml` and `uv.lock`; frontend dependencies are authoritative in `package.json` and
`package-lock.json`. There is no separately maintained `requirements.txt`.

## CLI and MCP user

Install the current default branch directly from GitHub with uv:

```bash
uv tool install --python 3.11 \
  'voxflow[mcp,asr-local,tts] @ git+https://github.com/jhuanxx44/voxflow.git'
voxflow --json doctor
voxflow mcp serve
```

The wheel includes one version-matched VoxFlow companion skill for Codex and Claude Code. Install
the required targets explicitly, then verify that each installed copy matches the wheel:

```bash
voxflow --json skill install codex
voxflow --json skill check codex
voxflow --json skill install claude
voxflow --json skill check claude
```

Codex uses `CODEX_HOME` or `~/.codex`; Claude uses `CLAUDE_CONFIG_DIR` or `~/.claude`. Both install
under their agent home's `skills/voxflow` directory. VoxFlow does not modify either agent during
ordinary package installation. Use `skill install TARGET --force` only when you intend to replace
an older or locally modified copy. Use `--target-home` for an explicit project or test location.

This includes local FunASR. For transcript import, editing, export, and MCP without Torch/FunASR,
install `voxflow[mcp]` from the same URL instead. Run `uv tool upgrade voxflow` to update and
`uv tool uninstall voxflow` to remove the tool environment. Project data remains in the platform
application data directory unless `VOXFLOW_HOME` points elsewhere.

## Web user

```bash
git clone https://github.com/jhuanxx44/voxflow.git
cd voxflow
./start.sh
```

`start.sh` checks uv and FFmpeg, syncs the locked Web/FunASR/provider environment, runs `npm ci`,
and starts Flask on `127.0.0.1:8082` plus Vite on `127.0.0.1:3001`. Open
`http://127.0.0.1:3001`. Use `./start.sh -b` for the backend only. The local Web server has no
multi-user authentication and must not be exposed directly to the public internet.

Copy `.env.example` to `.env` only when using optional legacy Web LLM/image/TTS providers. The
CLI/MCP editing engine and local FunASR do not require an LLM API key.

## Contributor

```bash
git clone https://github.com/jhuanxx44/voxflow.git
cd voxflow
make sync
npm ci
make check
npx playwright install chromium
npm run test:e2e
```

`make sync` installs all Python development, Web, MCP, ASR, provider, and TTS extras from the lock.
Use `make install-dev-cli` only when an editable globally callable CLI is useful during development.

## Troubleshooting

- `voxflow: command not found`: run `uv tool update-shell`, restart the shell, then check
  `uv tool dir --bin`.
- Python resolution failure: confirm `uv python install 3.11` succeeds and retry with
  `--python 3.11`; VoxFlow intentionally rejects Python 3.13 for the current local ASR stack.
- `doctor` reports FFmpeg or codec failure: install a full FFmpeg build and confirm both `ffmpeg`
  and `ffprobe` resolve from the same shell.
- FunASR/Torch is too large for the machine: use the lite `voxflow[mcp]` install and import an
  existing transcript, or run ASR in another compatible environment.
- Web dependency drift: do not use ad-hoc `pip install`; rerun `uv sync --frozen ...` through
  `./start.sh`, and use `npm ci` instead of editing `node_modules`.
- Port already in use: set `VOXFLOW_WEB_PORT` for Flask and pass a different Vite port manually;
  keep `VOXFLOW_CORS_ORIGINS` aligned with the browser origin.
