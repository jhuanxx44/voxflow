---
name: voxflow
description: Use the installed VoxFlow CLI or MCP server to import, transcribe, inspect, deterministically edit, and export local audio or video. Trigger for text-based media editing, transcript search, filler removal, clip trimming or reordering, speech replacement, subtitles, MP3/WAV/MP4 export, or any request to edit media with VoxFlow.
---

# VoxFlow

Treat VoxFlow as the deterministic editor. Interpret the user's editorial intent, then use bounded reads and explicit stable IDs to execute it. Keep editorial decisions in the agent; do not delegate them to fuzzy matching.

## Select the interface

Prefer configured VoxFlow MCP tools. Otherwise use the installed CLI with `--json` for every command whose output you inspect. Keep one project and revision history across interfaces.

Verify the installed version and environment before media work:

```bash
command -v voxflow
voxflow --json version
voxflow --json doctor
```

Require project schema version 1. If the command is missing or the schema major is unsupported, report the mismatch instead of guessing commands or persistent formats.

## Execute the editing workflow

1. Preserve the source media. Create a managed project and retain its `prj_*` ID:

   ```bash
   voxflow --json project create /absolute/path/input.mp4 --name "rough cut"
   ```

2. Start recognition when the project has no transcript. Wait when the user expects the result in the current task; otherwise retain the returned job ID and poll it:

   ```bash
   voxflow --json transcript start <project-id> --model advanced --wait
   voxflow --json job get <job-id>
   ```

3. Read bounded transcript pages or search for candidates. Use search only for discovery:

   ```bash
   voxflow --json transcript get <project-id> --offset 0 --limit 50
   voxflow --json transcript search <project-id> "就是说" --context 2 --limit 20
   voxflow --json timeline get <project-id> --limit 100
   ```

4. Refresh the timeline immediately before a write. Construct an Edit Plan with the current `expected_revision`, a unique `client_request_id`, a reason, and explicit `clip_*` or `tok_*` IDs. Use only operations supported by the current schema, such as `delete_clips`, `delete_ranges`, `move_clip`, `trim_clip`, `split_clip`, `correct_transcript`, `rename_speaker`, and `merge_speakers`.

5. Preview every plan before applying it:

   ```bash
   voxflow --json edit preview <project-id> --plan /absolute/path/edit-plan.json
   voxflow --json edit apply <project-id> --plan /absolute/path/edit-plan.json
   ```

   Inspect the returned diff and warnings. Apply when the user's request authorizes the edit and the preview matches it. Stop after preview when the user only requested review or a proposed plan.

6. Export to a new destination after the accepted edits:

   ```bash
   voxflow --json export create <project-id> --format mp4 --out /absolute/path/edited.mp4 --wait
   ```

Use MP4 only for video sources. Use MP3, WAV, SRT, or VTT as requested. Poll asynchronous exports with `job get`, then resolve managed output with `artifact get`.

## Handle speech replacement

Generate speech as a candidate without changing the timeline:

```bash
voxflow --json speech replace-start <project-id> <clip-id> \
  --expected-revision <revision> --text "replacement" --wait
```

Put the returned `recommended_operation` into an Edit Plan, then preview and apply it through the normal workflow. Do not treat candidate generation as a committed edit.

## Recover safely

- On `REVISION_CONFLICT`, reread the timeline and rebuild the plan with a new request ID. Never reuse stale indexes or IDs.
- On a failed or interrupted long job, inspect it before deciding whether to use `job retry`.
- Inspect history with `edit history`. Preview undo by default; pass `--apply` only when restoration is authorized.
- Use `raw read` only when bounded high-level reads are insufficient.
- Never overwrite source media, delete projects, expose media bytes in model context, or mutate by fuzzy transcript text.

When using MCP, preserve the same order: `doctor` → project → transcript/job → bounded timeline or search → `edit_preview` → `edit_apply` → `export_start` → `job_get` → `artifact_get`.
