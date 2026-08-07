from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from voxflow.application.runtime import Runtime
from voxflow.domain.errors import IdempotencyConflictError, RevisionConflictError, ValidationError
from voxflow.domain.models import Job, JobStatus
from voxflow.domain.operations import EditPlan
from voxflow.settings import Settings


def _create_transcribed(runtime: Runtime, wav_file: Path) -> str:
    project = runtime.store.create(wav_file)
    runtime.transcripts.import_payload(
        project.id,
        [
            {
                "text": "第一段第二段",
                "sentence_info": [
                    {"text": "第一段", "start": 0, "end": 1000, "spk": 0},
                    {"text": "第二段", "start": 1000, "end": 2000, "spk": 1},
                ],
            }
        ],
    )
    return project.id


def test_edit_apply_is_idempotent_and_persists(settings: Settings, wav_file: Path) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, wav_file)
    timeline = runtime.store.get_timeline(project_id)
    plan = EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": 1,
            "client_request_id": "integration-delete",
            "reason": "drop intro",
            "operations": [{"op": "delete_clips", "clip_ids": [timeline.clips[0].id]}],
        }
    )
    preview = runtime.edits.preview(plan)
    result = runtime.edits.apply(plan)
    replay = runtime.edits.apply(plan)
    assert preview.diff.duration_after_ms == 1000
    assert result["diff"] == preview.diff.model_dump(mode="json")
    assert result["revision"] == 2
    assert replay["revision"] == 2
    assert replay["idempotent_replay"] is True
    conflicting_retry = plan.model_copy(update={"reason": "same key, different payload"})
    with pytest.raises(IdempotencyConflictError):
        runtime.edits.apply(conflicting_retry)
    assert Runtime.create(settings).store.get(project_id).revision == 2

    restored = runtime.edits.undo_apply(
        project_id,
        expected_revision=2,
        to_revision=1,
        client_request_id="integration-undo",
    )
    assert restored["revision"] == 3
    assert len(runtime.store.get_timeline(project_id).clips) == 2


def test_failed_multi_operation_plan_is_atomic_and_stale_client_conflicts(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, wav_file)
    timeline = runtime.store.get_timeline(project_id)
    invalid = EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": 1,
            "client_request_id": "atomic-failure",
            "operations": [
                {
                    "op": "correct_transcript",
                    "clip_id": timeline.clips[0].id,
                    "text": "temporary change",
                },
                {"op": "delete_clips", "clip_ids": ["clip_missing"]},
            ],
        }
    )
    with pytest.raises(ValidationError):
        runtime.edits.apply(invalid)
    assert runtime.store.get(project_id).revision == 1
    assert runtime.store.get_timeline(project_id).clips[0].transcript_text == "第一段"
    assert not runtime.store.revision_path(project_id, 2).exists()

    first_client = EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": 1,
            "client_request_id": "client-one",
            "operations": [
                {"op": "correct_transcript", "clip_id": timeline.clips[0].id, "text": "甲"}
            ],
        }
    )
    stale_client = EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": 1,
            "client_request_id": "client-two",
            "operations": [
                {"op": "correct_transcript", "clip_id": timeline.clips[1].id, "text": "乙"}
            ],
        }
    )
    runtime.edits.apply(first_client)
    with pytest.raises(RevisionConflictError):
        runtime.edits.apply(stale_client)
    assert runtime.store.get(project_id).revision == 2


def test_idempotency_recovers_from_revision_after_catalog_crash_window(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, wav_file)
    timeline = runtime.store.get_timeline(project_id)
    original = EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": 1,
            "client_request_id": "crash-window-request",
            "operations": [
                {"op": "correct_transcript", "clip_id": timeline.clips[0].id, "text": "修正"}
            ],
        }
    )
    first_result = runtime.edits.apply(original)
    with runtime.catalog.connect() as connection:
        connection.execute(
            "DELETE FROM idempotency WHERE project_id = ? AND client_request_id = ?",
            (project_id, original.client_request_id),
        )
    later = EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": 2,
            "client_request_id": "later-request",
            "operations": [
                {"op": "correct_transcript", "clip_id": timeline.clips[1].id, "text": "后续"}
            ],
        }
    )
    runtime.edits.apply(later)
    recovered = runtime.edits.apply(original)
    assert recovered["revision"] == first_result["revision"] == 2
    assert recovered["idempotent_replay"] is True
    assert runtime.store.get(project_id).revision == 3


def test_inline_export_creates_media_and_subtitle_artifacts(
    settings: Settings, wav_file: Path, tmp_path: Path
) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, wav_file)
    audio_out = tmp_path / "edited.mp3"
    submitted = runtime.exports.start(
        project_id, output_format="mp3", out=audio_out, run_inline=True
    )
    job = runtime.jobs.get(submitted["id"])
    assert job.status == JobStatus.SUCCEEDED
    assert audio_out.is_file()
    assert job.result and Path(job.result["path"]).is_file()

    subtitle = runtime.exports.start(project_id, output_format="srt", run_inline=True)
    subtitle_job = runtime.jobs.get(subtitle["id"])
    assert subtitle_job.status == JobStatus.SUCCEEDED
    subtitle_path = Path(subtitle_job.result["path"])
    assert "第一段" in subtitle_path.read_text(encoding="utf-8")


def test_video_export_is_playable(settings: Settings, video_file: Path, tmp_path: Path) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, video_file)
    output = tmp_path / "edited.mp4"
    submitted = runtime.exports.start(project_id, output_format="mp4", out=output, run_inline=True)
    job = runtime.jobs.get(submitted["id"])
    assert job.status == JobStatus.SUCCEEDED, job.error
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name",
            "-of",
            "json",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(probe.stdout)
    stream_types = {item["codec_type"] for item in payload["streams"]}
    assert stream_types == {"audio", "video"}
    assert {item["codec_name"] for item in payload["streams"]} == {"h264", "aac"}
    assert abs(float(payload["format"]["duration"]) - 2.0) <= 0.15


def test_token_range_deletion_renders_expected_duration(
    settings: Settings, wav_file: Path, tmp_path: Path
) -> None:
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file)
    runtime.transcripts.import_payload(
        project.id,
        [
            {
                "text": "甲乙丙后段",
                "sentence_info": [
                    {
                        "text": "甲乙丙",
                        "start": 0,
                        "end": 1500,
                        "timestamp": [[0, 500], [500, 1000], [1000, 1500]],
                    },
                    {"text": "后段", "start": 1500, "end": 2000},
                ],
            }
        ],
    )
    transcript = runtime.store.get_transcript(project.id)
    timeline = runtime.store.get_timeline(project.id)
    middle_token = transcript.segments[0].tokens[1]
    plan = EditPlan.model_validate(
        {
            "project_id": project.id,
            "expected_revision": 1,
            "client_request_id": "token-delete-render",
            "operations": [
                {
                    "op": "delete_ranges",
                    "clip_id": timeline.clips[0].id,
                    "start_token_id": middle_token.id,
                    "end_token_id": middle_token.id,
                }
            ],
        }
    )
    preview = runtime.edits.preview(plan)
    applied = runtime.edits.apply(plan)
    assert preview.diff.duration_after_ms == 1500
    assert applied["diff"] == preview.diff.model_dump(mode="json")
    output = tmp_path / "word-deleted.wav"
    submitted = runtime.exports.start(project.id, output_format="wav", out=output, run_inline=True)
    assert runtime.jobs.get(submitted["id"]).status == JobStatus.SUCCEEDED
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    assert abs(float(probe.stdout.strip()) - 1.5) <= 0.03


def test_video_without_audio_can_export_video_only_mp4(
    settings: Settings, video_without_audio_file: Path, tmp_path: Path
) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, video_without_audio_file)
    output = tmp_path / "video-only-edited.mp4"
    submitted = runtime.exports.start(project_id, output_format="mp4", out=output, run_inline=True)
    job = runtime.jobs.get(submitted["id"])
    assert job.status == JobStatus.SUCCEEDED, job.error
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type",
            "-of",
            "json",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(probe.stdout)
    assert {item["codec_type"] for item in payload["streams"]} == {"video"}
    assert abs(float(payload["format"]["duration"]) - 2.0) <= 0.15
    with pytest.raises(ValidationError, match="requires an audio stream"):
        runtime.exports.start(project_id, output_format="mp3", run_inline=True)


def test_empty_timeline_cannot_be_exported(settings: Settings, wav_file: Path) -> None:
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file)
    with pytest.raises(ValidationError, match="timeline is empty"):
        runtime.exports.start(project.id, output_format="wav", run_inline=True)


def test_transcript_and_output_paths_are_validated_before_render(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file)
    with pytest.raises(ValidationError, match="exceed source media duration"):
        runtime.transcripts.import_payload(
            project.id,
            [
                {
                    "text": "overflow",
                    "sentence_info": [{"text": "overflow", "start": 0, "end": 6000}],
                }
            ],
        )

    project_id = _create_transcribed(runtime, wav_file)
    with pytest.raises(ValidationError, match="cannot overwrite the source"):
        runtime.exports.start(
            project_id,
            output_format="wav",
            out=Path(runtime.store.get(project_id).source.managed_path),
            run_inline=True,
        )
    with pytest.raises(ValidationError, match="file path, not a directory"):
        runtime.exports.start(
            project_id,
            output_format="wav",
            out=settings.home,
            run_inline=True,
        )


def test_changed_managed_source_fails_export_before_ffmpeg(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, wav_file)
    source = Path(runtime.store.get(project_id).source.managed_path)
    source.write_bytes(source.read_bytes() + b"changed")
    submitted = runtime.exports.start(project_id, output_format="wav", run_inline=True)
    failed = runtime.jobs.get(submitted["id"])
    assert failed.status == JobStatus.FAILED
    assert failed.error and failed.error["code"] == "VALIDATION_ERROR"
    assert "missing or changed" in failed.error["message"]


def test_ffmpeg_timeout_fails_job_and_removes_partial_output(
    settings: Settings, wav_file: Path
) -> None:
    timeout_settings = Settings(
        home=settings.home,
        job_inline=True,
        export_timeout_seconds=0,
    )
    runtime = Runtime.create(timeout_settings)
    project_id = _create_transcribed(runtime, wav_file)
    submitted = runtime.exports.start(project_id, output_format="wav", run_inline=True)
    failed = runtime.jobs.get(submitted["id"])
    assert failed.status == JobStatus.FAILED
    assert failed.error and failed.error["code"] == "VALIDATION_ERROR"
    assert failed.error["details"]["timeout_seconds"] == 0
    exports_dir = runtime.store.project_dir(project_id) / "exports"
    assert not list(exports_dir.glob("*.partial.*"))


def test_detached_export_job_completes_in_worker_process(
    settings: Settings, wav_file: Path
) -> None:
    detached_settings = Settings(home=settings.home, job_inline=False)
    runtime = Runtime.create(detached_settings)
    project_id = _create_transcribed(runtime, wav_file)
    submitted = runtime.exports.start(project_id, output_format="wav", run_inline=False)
    completed = runtime.jobs.wait(submitted["id"], timeout=20)
    assert completed.status == JobStatus.SUCCEEDED
    assert completed.worker_pid and completed.worker_pid != 0
    assert completed.result and Path(completed.result["path"]).is_file()


def test_cancelled_export_job_can_be_retried_as_new_persistent_attempt(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    project_id = _create_transcribed(runtime, wav_file)
    previous = Job(
        id="job_cancelled_export",
        kind="export",
        project_id=project_id,
        status=JobStatus.CANCELLED,
        request={"format": "wav", "revision": 1, "out": None},
    )
    runtime.catalog.upsert_job(previous)
    retried = runtime.jobs.retry(previous.id, run_inline=True)
    assert retried.id != previous.id
    assert retried.status == JobStatus.SUCCEEDED
    assert retried.request["retry_of"] == previous.id
    assert Runtime.create(settings).jobs.get(retried.id).status == JobStatus.SUCCEEDED
