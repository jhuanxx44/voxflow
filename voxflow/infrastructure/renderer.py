"""Deterministic timeline compiler, subtitle writer, and FFmpeg export worker."""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, cast

from voxflow.domain.errors import DependencyError, JobCancelledError, ValidationError
from voxflow.domain.ids import new_artifact_id
from voxflow.domain.models import (
    Artifact,
    ArtifactKind,
    Job,
    RenderPlan,
    RenderRange,
    TimelineRevision,
)
from voxflow.infrastructure.files import fsync_directory, sha256_file

if TYPE_CHECKING:
    from voxflow.application.runtime import Runtime


def compile_render_plan(
    project_id: str,
    revision: TimelineRevision,
    *,
    source_path: Path,
    source_has_video: bool,
    source_has_audio: bool,
    output_format: str,
) -> RenderPlan:
    ranges: list[RenderRange] = []
    for clip in revision.clips:
        if clip.kind != "source":
            raise ValidationError(
                "Replacement clips are not supported by the Phase 0-6 renderer",
                details={"clip_id": clip.id},
            )
        next_range = RenderRange(source_in_ms=clip.source_in_ms, source_out_ms=clip.source_out_ms)
        gap_ms = next_range.source_in_ms - ranges[-1].source_out_ms if ranges else None
        if ranges and gap_ms == 0:
            ranges[-1].source_out_ms = next_range.source_out_ms
        else:
            ranges.append(next_range)
    if not ranges:
        raise ValidationError("Cannot render an empty timeline")
    return RenderPlan(
        project_id=project_id,
        revision=revision.revision,
        source_path=str(source_path),
        source_has_video=source_has_video,
        source_has_audio=source_has_audio,
        ranges=ranges,
        output_format=cast(Literal["mp4", "mp3", "wav", "srt", "vtt"], output_format),
    )


def build_ffmpeg_args(plan: RenderPlan, output_path: Path, ffmpeg: str = "ffmpeg") -> list[str]:
    include_video = plan.output_format == "mp4" and plan.source_has_video
    include_audio = plan.source_has_audio
    if not include_audio and not include_video:
        raise ValidationError("The requested output requires an audio stream")
    filters: list[str] = []
    for index, item in enumerate(plan.ranges):
        start = item.source_in_ms / 1000
        end = item.source_out_ms / 1000
        if include_video:
            filters.append(
                f"[0:v]trim=start={start:.6f}:end={end:.6f},setpts=PTS-STARTPTS[v{index}]"
            )
        if include_audio:
            filters.append(
                f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[a{index}]"
            )
    if include_video and include_audio:
        inputs = "".join(f"[v{index}][a{index}]" for index in range(len(plan.ranges)))
        filters.append(f"{inputs}concat=n={len(plan.ranges)}:v=1:a=1[outv][outa]")
        maps = ["-map", "[outv]", "-map", "[outa]"]
        codecs = ["-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac"]
    elif include_video:
        inputs = "".join(f"[v{index}]" for index in range(len(plan.ranges)))
        filters.append(f"{inputs}concat=n={len(plan.ranges)}:v=1:a=0[outv]")
        maps = ["-map", "[outv]"]
        codecs = ["-c:v", "libx264", "-preset", "fast", "-crf", "23"]
    else:
        inputs = "".join(f"[a{index}]" for index in range(len(plan.ranges)))
        filters.append(f"{inputs}concat=n={len(plan.ranges)}:v=0:a=1[outa]")
        maps = ["-map", "[outa]"]
        if plan.output_format == "mp3":
            codecs = ["-c:a", "libmp3lame", "-b:a", "192k"]
        elif plan.output_format == "wav":
            codecs = ["-c:a", "pcm_s16le", "-ar", "44100"]
        else:
            raise ValidationError("Audio-only render plan requires mp3 or wav output")
    return [
        ffmpeg,
        "-y",
        "-v",
        "error",
        "-i",
        plan.source_path,
        "-filter_complex",
        ";".join(filters),
        *maps,
        *codecs,
        str(output_path),
    ]


def _format_timestamp(milliseconds: int, *, vtt: bool) -> str:
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    separator = "." if vtt else ","
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{separator}{millis:03d}"


def render_subtitles(timeline: TimelineRevision, *, vtt: bool) -> str:
    lines = ["WEBVTT", ""] if vtt else []
    cursor = 0
    for index, clip in enumerate(timeline.clips, 1):
        end = cursor + clip.duration_ms
        if not vtt:
            lines.append(str(index))
        lines.append(f"{_format_timestamp(cursor, vtt=vtt)} --> {_format_timestamp(end, vtt=vtt)}")
        lines.extend([clip.transcript_text, ""])
        cursor = end
    return "\n".join(lines)


def _run_ffmpeg(job: Job, runtime: Runtime, args: list[str]) -> None:
    if shutil.which(runtime.settings.ffmpeg) is None:
        raise DependencyError("ffmpeg is not installed or not on PATH")
    log_path = Path(job.log_path or runtime.settings.jobs_dir / f"{job.id}.log")
    partial_output = Path(args[-1])
    with log_path.open("ab") as log:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log)
        started = time.monotonic()
        while process.poll() is None:
            refreshed = runtime.jobs.get(job.id)
            if refreshed.cancel_requested:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                partial_output.unlink(missing_ok=True)
                raise JobCancelledError("Export was cancelled")
            if time.monotonic() - started > runtime.settings.export_timeout_seconds:
                process.kill()
                process.wait()
                partial_output.unlink(missing_ok=True)
                raise ValidationError(
                    "FFmpeg export timed out",
                    details={"timeout_seconds": runtime.settings.export_timeout_seconds},
                )
            time.sleep(0.25)
        if process.returncode != 0:
            partial_output.unlink(missing_ok=True)
            raise ValidationError(
                "FFmpeg export failed",
                details={"returncode": process.returncode, "log_path": str(log_path)},
            )


def execute_export_job(job: Job, runtime: Runtime) -> dict[str, Any]:
    project = runtime.store.get(job.project_id)
    revision_number = int(job.request["revision"])
    timeline = runtime.store.get_timeline(job.project_id, revision_number)
    source = Path(project.source.managed_path)
    if not source.is_file() or sha256_file(source) != project.source.sha256:
        raise ValidationError("Source media is missing or changed after project creation")
    output_format = str(job.request["format"])
    artifact_id = new_artifact_id()
    output_path = (
        runtime.store.project_dir(project.id) / "exports" / f"{artifact_id}.{output_format}"
    )
    temporary_path = output_path.with_name(f"{artifact_id}.partial.{output_format}")
    runtime.jobs.update(job, phase="compiling", progress=0.1)
    if output_format in {"srt", "vtt"}:
        content = render_subtitles(timeline, vtt=output_format == "vtt")
        temporary_path.write_text(content, encoding="utf-8")
        kind = ArtifactKind.SUBTITLE
        mime_type = "text/vtt" if output_format == "vtt" else "application/x-subrip"
    else:
        plan = compile_render_plan(
            project.id,
            timeline,
            source_path=source,
            source_has_video=project.source.media.has_video,
            source_has_audio=project.source.media.has_audio,
            output_format=output_format,
        )
        runtime.jobs.update(job, phase="rendering", progress=0.2)
        args = build_ffmpeg_args(plan, temporary_path, runtime.settings.ffmpeg)
        _run_ffmpeg(job, runtime, args)
        kind = ArtifactKind.EXPORT_VIDEO if output_format == "mp4" else ArtifactKind.EXPORT_AUDIO
        mime_type = {
            "mp4": "video/mp4",
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
        }[output_format]
    os.replace(temporary_path, output_path)
    fsync_directory(output_path.parent)
    requested_out = job.request.get("out")
    copied_to: str | None = None
    if requested_out:
        destination = Path(str(requested_out))
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(output_path, destination)
        copied_to = str(destination)
    artifact = Artifact(
        id=artifact_id,
        project_id=project.id,
        kind=kind,
        path=str(output_path),
        mime_type=mime_type,
        size_bytes=output_path.stat().st_size,
        sha256=sha256_file(output_path),
        metadata={
            "revision": revision_number,
            "format": output_format,
            "copied_to": copied_to,
        },
    )
    runtime.store.register_artifact(artifact)
    return {
        "project_id": project.id,
        "revision": revision_number,
        "artifact_id": artifact.id,
        "path": artifact.path,
        "copied_to": copied_to,
        "size_bytes": artifact.size_bytes,
        "sha256": artifact.sha256,
    }
