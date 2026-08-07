"""Reproducible 30–120 minute real-speech ASR/edit/export acceptance run."""

from __future__ import annotations

import argparse
import hashlib
import json
import resource
import subprocess
import sys
import tempfile
import time
import urllib.request
from contextlib import nullcontext
from pathlib import Path
from typing import Any

from voxflow.application.runtime import Runtime
from voxflow.domain.models import JobStatus
from voxflow.domain.operations import EditPlan
from voxflow.settings import Settings

SAMPLE_URL = "https://isv-data.oss-cn-hangzhou.aliyuncs.com/ics/MaaS/ASR/test_audio/vad_example.wav"
SAMPLE_SHA256 = "a7431f0169ef76ef630c945a1d2c3675d8c8c2df2ae4a6b16f8a88ba1bccfbbb"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _run(args: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=timeout)


def _probe(path: Path) -> dict[str, Any]:
    result = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=codec_type,codec_name",
            "-of",
            "json",
            str(path),
        ],
        timeout=120,
    )
    return dict(json.loads(result.stdout))


def _download_sample(destination: Path) -> None:
    with urllib.request.urlopen(SAMPLE_URL, timeout=60) as response:  # noqa: S310
        destination.write_bytes(response.read())
    actual = _sha256(destination)
    if actual != SAMPLE_SHA256:
        raise RuntimeError(f"Official sample SHA-256 mismatch: {actual}")


def _create_long_source(sample: Path, destination: Path, seconds: int) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-stream_loop",
            "-1",
            "-i",
            str(sample),
            "-t",
            str(seconds),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "64k",
            str(destination),
        ],
        timeout=1800,
    )


def _maximum_rss_bytes() -> int:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform == "darwin" else value * 1024)


def _timed(action: Any) -> tuple[Any, float]:
    started = time.monotonic()
    return action(), time.monotonic() - started


def execute(root: Path, *, minutes: int, model: str) -> dict[str, Any]:
    root.mkdir(parents=True, exist_ok=True)
    sample = root / "funasr-vad-example.wav"
    source = root / f"real-speech-loop-{minutes}m.mp3"
    _download_sample(sample)
    _create_long_source(sample, source, minutes * 60)
    source_probe = _probe(source)

    settings = Settings(home=root / "voxflow-home", job_inline=True, min_free_bytes=0)
    runtime = Runtime.create(settings)
    project, create_seconds = _timed(lambda: runtime.store.create(source, name="V1 long stress"))
    print(f"project created in {create_seconds:.2f}s", file=sys.stderr, flush=True)

    transcribe, asr_seconds = _timed(
        lambda: runtime.jobs.submit(
            "transcribe",
            project.id,
            {"model": model, "hotwords": ""},
            run_inline=True,
        )
    )
    if transcribe.status != JobStatus.SUCCEEDED:
        raise RuntimeError(f"ASR failed: {transcribe.error}")
    print(f"ASR completed in {asr_seconds:.2f}s", file=sys.stderr, flush=True)
    timeline = runtime.store.get_timeline(project.id)
    if len(timeline.clips) < 12:
        raise RuntimeError(f"ASR produced only {len(timeline.clips)} clips; need at least 12")

    deletable_indexes = [round(index * (len(timeline.clips) - 3) / 9) + 1 for index in range(10)]
    deleted_ids = [timeline.clips[index].id for index in deletable_indexes]
    operations: list[dict[str, Any]] = [
        *({"op": "delete_clips", "clip_ids": [clip_id]} for clip_id in deleted_ids),
        {
            "op": "move_clip",
            "clip_id": timeline.clips[-1].id,
            "anchor_clip_id": timeline.clips[0].id,
            "position": "before",
        },
        {
            "op": "correct_transcript",
            "clip_id": timeline.clips[0].id,
            "text": timeline.clips[0].transcript_text + "（压力验收修订）",
        },
    ]
    plan = EditPlan.model_validate(
        {
            "project_id": project.id,
            "expected_revision": timeline.revision,
            "client_request_id": "v1-long-stress-12-operations",
            "reason": "10 deletions, one move, and one transcript correction",
            "operations": operations,
        }
    )
    preview, preview_seconds = _timed(lambda: runtime.edits.preview(plan))
    applied, apply_seconds = _timed(lambda: runtime.edits.apply(plan))
    if applied["diff"] != preview.diff.model_dump(mode="json"):
        raise RuntimeError("Edit preview/apply diff mismatch")
    print(
        f"12 edit operations applied in {apply_seconds:.3f}s",
        file=sys.stderr,
        flush=True,
    )

    export, export_seconds = _timed(
        lambda: runtime.exports.start(project.id, output_format="mp3", run_inline=True)
    )
    completed = runtime.jobs.get(export["id"])
    if completed.status != JobStatus.SUCCEEDED or not completed.result:
        raise RuntimeError(f"Export failed: {completed.error}")
    artifact = runtime.catalog.get_artifact(completed.result["artifact_id"])
    if artifact is None:
        raise RuntimeError("Export artifact is absent from the catalog")
    output = Path(artifact.path)
    output_probe = _probe(output)
    output_duration = float(output_probe["format"]["duration"])
    expected_duration = preview.diff.duration_after_ms / 1000
    if abs(output_duration - expected_duration) > 0.25:
        raise RuntimeError(
            f"Export duration mismatch: expected {expected_duration}, got {output_duration}"
        )
    print(f"MP3 export completed in {export_seconds:.2f}s", file=sys.stderr, flush=True)

    return {
        "ok": True,
        "fixture": {
            "url": SAMPLE_URL,
            "sample_sha256": SAMPLE_SHA256,
            "construction": "official natural-speech sample repeated with FFmpeg",
            "source_sha256": _sha256(source),
            "source_probe": source_probe,
        },
        "model": model,
        "project_id": project.id,
        "segment_count": runtime.store.get(project.id).transcript.segment_count,
        "clip_count_before": len(timeline.clips),
        "clip_count_after": len(runtime.store.get_timeline(project.id).clips),
        "edit_operation_count": 12,
        "deleted_clip_count": len(deleted_ids),
        "revision": runtime.store.get(project.id).revision,
        "timings_seconds": {
            "project_create": round(create_seconds, 3),
            "asr": round(asr_seconds, 3),
            "edit_preview": round(preview_seconds, 3),
            "edit_apply": round(apply_seconds, 3),
            "export": round(export_seconds, 3),
        },
        "maximum_rss_bytes": _maximum_rss_bytes(),
        "output": {
            "artifact_id": artifact.id,
            "sha256": artifact.sha256,
            "probe": output_probe,
            "expected_duration_seconds": expected_duration,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--minutes", type=int, default=30, choices=range(30, 121))
    parser.add_argument("--model", choices=("basic", "advanced"), default="advanced")
    parser.add_argument("--work-dir", type=Path)
    arguments = parser.parse_args()
    context = (
        nullcontext(arguments.work_dir.resolve())
        if arguments.work_dir
        else tempfile.TemporaryDirectory(prefix="voxflow-v1-long-")
    )
    with context as selected:
        root = Path(selected)
        result = execute(root, minutes=arguments.minutes, model=arguments.model)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
