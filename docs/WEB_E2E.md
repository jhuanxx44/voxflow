# Web E2E regression

VoxFlow's Playwright suite exercises the real versioned API, persistent edit store, job system,
FFmpeg renderer, and browser downloads. Only ASR model inference is replaced with a deterministic
test provider so the suite is fast and does not download model weights.

## Run locally

Install the project and browser once:

```bash
uv sync --python 3.11 --extra web --extra providers
npm ci
npx playwright install chromium
```

Then run the complete desktop and mobile matrix:

```bash
npm run test:e2e
```

Use `npm run test:e2e:headed` to watch the interactions. If a managed Chromium download is not
available but a compatible local Chrome installation is present, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable for local verification. CI always installs
the pinned Playwright Chromium build.

## Isolation and coverage

The test server creates a unique temporary `VOXFLOW_HOME` for every run and deletes it when the
server exits. Runtime fixtures are generated under ignored `.e2e/`; no user projects, caches, or
model configuration are read.

The desktop scenario covers video upload, ASR job normalization, transcript search, playback
seek, token and segment deletion, undo/redo, native drag-and-drop, speaker rename/merge, reload
persistence, and MP4/MP3/WAV/SRT/VTT downloads. Media outputs are checked with `ffprobe` and
subtitle outputs are parsed as text. The mobile scenario covers audio upload at 390×844 and blocks
console errors, page errors, framework overlays, and horizontal overflow.
