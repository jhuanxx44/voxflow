# Third-party software and model notices

VoxFlow source code is licensed under the [MIT License](LICENSE). That license
does not change the licenses of software, services, media, or model weights
used with VoxFlow.

## Runtime and development dependencies

Python and JavaScript dependencies are installed from their respective package
registries and are not relicensed by VoxFlow. Their exact names and resolved
versions are recorded in `pyproject.toml`, `uv.lock`, `package.json`, and
`package-lock.json`. Each package remains subject to its own license and
notices.

Prominent dependencies include FunASR, ModelScope, PyTorch, Flask, Pydantic,
Typer, the Model Context Protocol Python SDK, React, Vite, Tailwind CSS,
Zustand, and Immer. Before redistributing a bundled application, generate and
review a complete software bill of materials from the lockfiles and include
all notices required by the selected dependency versions.

## Vendored UI/UX Pro Max skill

Files under `.claude/skills/ui-ux-pro-max/` are derived from
[UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill),
Copyright (c) 2024 Next Level Builder, and are distributed under the MIT
License. The required copyright and permission notice is preserved in
[`LICENSES/ui-ux-pro-max-MIT.txt`](LICENSES/ui-ux-pro-max-MIT.txt).

## FFmpeg

VoxFlow invokes a separately installed `ffmpeg`/`ffprobe`; it does not include
an FFmpeg binary. FFmpeg builds can be licensed under LGPL or GPL terms,
depending on their configuration. Users and distributors are responsible for
the license obligations of the FFmpeg build they install or redistribute. See
<https://ffmpeg.org/legal.html>.

## Speech, language, and TTS models

VoxFlow can download or connect to third-party ASR, speaker, punctuation, LLM,
and TTS models or services. Model weights and hosted services may have license,
acceptable-use, geographic, or commercial-use terms that differ from the
libraries that load them. VoxFlow's MIT License does not grant rights to those
weights, voices, training data, generated media, or services.

Review the model card and provider terms for every configured model before
production or commercial use. No third-party model weights are committed to
this repository or included in the VoxFlow Python wheel.

## User-provided media

Users are responsible for having the necessary rights to process, modify, and
export source media, reference voices, transcripts, and generated output.
