from __future__ import annotations

import os
import signal
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest

from voxflow.application.runtime import Runtime
from voxflow.domain.errors import (
    ProviderTimeoutError,
    RevisionConflictError,
    SchemaCompatibilityError,
)
from voxflow.domain.models import Job, JobStatus, utc_now
from voxflow.domain.operations import EditPlan
from voxflow.infrastructure.files import atomic_write_json, read_json
from voxflow.infrastructure.speech import FakeSpeechProvider
from voxflow.settings import Settings


def _transcribed(runtime: Runtime, source: Path) -> tuple[str, list[str]]:
    project = runtime.store.create(source)
    runtime.transcripts.import_payload(
        project.id,
        [
            {
                "text": "甲乙",
                "sentence_info": [
                    {"text": "甲", "start": 0, "end": 1000, "spk": 0},
                    {"text": "乙", "start": 1000, "end": 2000, "spk": 1},
                ],
            }
        ],
    )
    return project.id, [clip.id for clip in runtime.store.get_timeline(project.id).clips]


def test_migration_dry_run_backup_apply_and_idempotency(settings: Settings, wav_file: Path) -> None:
    runtime = Runtime.create(settings)
    project_id, _clips = _transcribed(runtime, wav_file)
    directory = runtime.store.project_dir(project_id)
    manifests = [
        runtime.store.manifest_path(project_id),
        runtime.store.transcript_path(project_id),
        *sorted((directory / "revisions").glob("*.json")),
        *sorted((directory / "artifacts").glob("*.json")),
    ]
    for path in manifests:
        payload = read_json(path)
        payload.pop("schema_version", None)
        atomic_write_json(path, payload)

    with pytest.raises(SchemaCompatibilityError, match="requires migration"):
        runtime.store.get(project_id)
    preview = runtime.migrations.migrate(project_id, dry_run=True)
    assert preview["migration_required"] is True
    assert preview["changed_documents"] == 0
    assert all("schema_version" not in read_json(path) for path in manifests)

    applied = runtime.migrations.migrate(project_id, dry_run=False)
    assert applied["changed_documents"] == len(manifests)
    assert applied["backup"]
    backup = directory / applied["backup"]
    assert (backup / "project.json").is_file()
    assert "schema_version" not in read_json(backup / "project.json")
    assert all(read_json(path)["schema_version"] == 1 for path in manifests)
    assert runtime.store.get(project_id).schema_version == 1

    replay = runtime.migrations.migrate(project_id, dry_run=False)
    assert replay["migration_required"] is False
    assert replay["changed_documents"] == 0
    assert replay["backup"] is None


def test_newer_schema_is_explicitly_rejected(settings: Settings, wav_file: Path) -> None:
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file)
    payload = read_json(runtime.store.manifest_path(project.id))
    payload["schema_version"] = 2
    atomic_write_json(runtime.store.manifest_path(project.id), payload)

    for action in (
        lambda: runtime.store.get(project.id),
        lambda: runtime.migrations.migrate(project.id, dry_run=True),
    ):
        with pytest.raises(SchemaCompatibilityError) as raised:
            action()
        assert raised.value.code == "SCHEMA_VERSION_UNSUPPORTED"
        assert raised.value.details["found"] == 2
        assert raised.value.details["supported"] == 1


def test_cleanup_preserves_any_revision_reference_and_sweeps_expired_orphans(
    settings: Settings, wav_file: Path
) -> None:
    selected = replace(
        settings,
        tts_provider="fake",
        candidate_ttl_seconds=60,
        cache_ttl_seconds=10**9,
        temporary_ttl_seconds=60,
    )
    runtime = Runtime.create(selected)
    project_id, clips = _transcribed(runtime, wav_file)

    def candidate(duration: int) -> dict[str, Any]:
        submitted = runtime.speech.start(
            project_id,
            expected_revision=1,
            clip_id=clips[0],
            text=f"候选{duration}",
            parameters={"fake_duration_ms": duration},
            run_inline=True,
        )
        assert submitted["status"] == "succeeded"
        return dict(submitted["result"])

    referenced = candidate(900)
    orphan = candidate(1100)
    runtime.edits.apply(
        EditPlan.model_validate(
            {
                "project_id": project_id,
                "expected_revision": 1,
                "client_request_id": "attach-cleanup-reference",
                "operations": [referenced["recommended_operation"]],
            }
        )
    )
    old = (utc_now() - timedelta(days=30)).isoformat()
    for artifact_id in (referenced["artifact_id"], orphan["artifact_id"]):
        manifest = runtime.store.project_dir(project_id) / "artifacts" / f"{artifact_id}.json"
        payload = read_json(manifest)
        payload["created_at"] = old
        atomic_write_json(manifest, payload)

    partial = runtime.store.project_dir(project_id) / "exports" / "stale.partial.wav"
    partial.write_bytes(b"partial")
    stale_epoch = (utc_now() - timedelta(days=2)).timestamp()
    os.utime(partial, (stale_epoch, stale_epoch))

    preview = runtime.cleanup.run(dry_run=True)
    ids = {item["artifact_id"] for item in preview["items"]}
    assert orphan["artifact_id"] in ids
    assert referenced["artifact_id"] not in ids
    assert Path(orphan["path"]).is_file()
    assert partial.is_file()

    applied = runtime.cleanup.run(dry_run=False)
    assert applied["deleted"] == preview["would_delete"]
    assert not Path(orphan["path"]).exists()
    assert runtime.catalog.get_artifact(orphan["artifact_id"]) is None
    assert Path(referenced["path"]).is_file()
    assert runtime.catalog.get_artifact(referenced["artifact_id"]) is not None
    assert not partial.exists()


def test_diagnostics_bundle_excludes_requests_text_paths_and_secrets(
    settings: Settings, wav_file: Path, tmp_path: Path
) -> None:
    runtime = Runtime.create(replace(settings, tts_service_url="https://secret.invalid?token=abc"))
    project_id, _clips = _transcribed(runtime, wav_file)
    job = Job(
        id="job_diagnostics_secret",
        kind="export",
        project_id=project_id,
        status=JobStatus.FAILED,
        request={
            "text": "PRIVATE_TRANSCRIPT_SENTINEL",
            "api_key": "PRIVATE_KEY_SENTINEL",
            "out": str(tmp_path / "private-output.wav"),
        },
        error={
            "code": "TEST_ERROR",
            "message": f"failed at {settings.home}/private.log",
            "retryable": True,
            "details": {
                "api_key": "PRIVATE_KEY_SENTINEL",
                "log_path": str(settings.home / "private.log"),
                "timeout_seconds": 3,
            },
        },
    )
    runtime.catalog.upsert_job(job)
    bundle = tmp_path / "diagnostics.zip"
    created = runtime.diagnostics.create(bundle)
    assert created["redacted"] is True
    with pytest.raises(ValueError, match="already exists"):
        runtime.diagnostics.create(bundle)

    with zipfile.ZipFile(bundle) as archive:
        assert set(archive.namelist()) == {
            "manifest.json",
            "config.json",
            "doctor.json",
            "jobs.json",
            "events.json",
        }
        combined = "\n".join(archive.read(name).decode() for name in archive.namelist())
    assert "PRIVATE_TRANSCRIPT_SENTINEL" not in combined
    assert "PRIVATE_KEY_SENTINEL" not in combined
    assert str(settings.home) not in combined
    assert str(wav_file) not in combined
    assert '"request"' not in combined
    assert '"log_path"' not in combined
    assert '"contains_media": false' in combined
    assert '"contains_transcript": false' in combined


def test_insufficient_disk_job_is_diagnostic_and_retryable(
    settings: Settings, wav_file: Path, tmp_path: Path
) -> None:
    base = Runtime.create(replace(settings, min_free_bytes=0))
    project_id, _clips = _transcribed(base, wav_file)
    impossible = Runtime.create(replace(settings, min_free_bytes=10**30))
    submitted = impossible.exports.start(project_id, output_format="wav", run_inline=True)
    failed = impossible.jobs.get(submitted["id"])
    assert failed.status == JobStatus.FAILED
    assert failed.error and failed.error["code"] == "INSUFFICIENT_STORAGE"
    assert failed.error["retryable"] is True

    recovered_runtime = Runtime.create(replace(settings, min_free_bytes=0))
    recovered = recovered_runtime.jobs.retry(failed.id, run_inline=True)
    assert recovered.status == JobStatus.SUCCEEDED
    assert recovered.result and Path(recovered.result["path"]).is_file()
    assert Path(recovered.result["path"]).parent != tmp_path


def test_tts_timeout_cleans_partial_and_retry_succeeds(
    settings: Settings,
    wav_file: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class TimeoutProvider(FakeSpeechProvider):
        def synthesize(self, **kwargs: Any) -> None:
            output_path = Path(kwargs["output_path"])
            output_path.write_bytes(b"partial secret")
            raise ProviderTimeoutError("TTS generation timed out", details={"timeout_seconds": 1})

    runtime = Runtime.create(replace(settings, tts_provider="fake"))
    project_id, clips = _transcribed(runtime, wav_file)
    monkeypatch.setattr(
        "voxflow.worker.provider_from_settings", lambda _settings: TimeoutProvider()
    )
    submitted = runtime.speech.start(
        project_id,
        expected_revision=1,
        clip_id=clips[0],
        text="超时后重试",
        run_inline=True,
    )
    failed = runtime.jobs.get(submitted["id"])
    assert failed.status == JobStatus.FAILED
    assert failed.error and failed.error["code"] == "PROVIDER_TIMEOUT"
    assert failed.error["retryable"] is True
    assert not list((runtime.store.project_dir(project_id) / "replacements").glob("*.partial.*"))

    monkeypatch.setattr(
        "voxflow.worker.provider_from_settings", lambda _settings: FakeSpeechProvider()
    )
    recovered = runtime.jobs.retry(failed.id, run_inline=True)
    assert recovered.status == JobStatus.SUCCEEDED
    assert recovered.result and Path(recovered.result["path"]).is_file()


def test_ten_readers_and_two_stale_writers_have_one_atomic_winner(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    project_id, clips = _transcribed(runtime, wav_file)

    with ThreadPoolExecutor(max_workers=10) as executor:
        snapshots = list(executor.map(lambda _index: runtime.store.get(project_id), range(10)))
    assert {snapshot.revision for snapshot in snapshots} == {1}

    plans = [
        EditPlan.model_validate(
            {
                "project_id": project_id,
                "expected_revision": 1,
                "client_request_id": f"concurrent-writer-{index}",
                "operations": [
                    {"op": "correct_transcript", "clip_id": clips[index], "text": str(index)}
                ],
            }
        )
        for index in range(2)
    ]

    def write(plan: EditPlan) -> str:
        try:
            runtime.edits.apply(plan)
            return "applied"
        except RevisionConflictError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(write, plans))
    assert sorted(results) == ["applied", "conflict"]
    assert runtime.store.get(project_id).revision == 2


def test_strong_killed_detached_worker_is_interrupted_and_retryable(
    settings: Settings, wav_file: Path, tmp_path: Path
) -> None:
    marker = tmp_path / "ffmpeg-started"
    wrapper = tmp_path / "slow-ffmpeg"
    wrapper.write_text(
        f"#!/bin/sh\n: > '{marker}'\nsleep 60\nexec ffmpeg \"$@\"\n",
        encoding="utf-8",
    )
    wrapper.chmod(0o755)
    detached_settings = replace(
        settings,
        ffmpeg=str(wrapper),
        job_inline=False,
        min_free_bytes=0,
    )
    runtime = Runtime.create(detached_settings)
    project_id, _clips = _transcribed(runtime, wav_file)
    submitted = runtime.exports.start(project_id, output_format="wav", run_inline=False)
    deadline = time.monotonic() + 10
    worker_pid: int | None = None
    while time.monotonic() < deadline:
        running = runtime.jobs.get(submitted["id"])
        worker_pid = running.worker_pid
        if marker.is_file() and running.status == JobStatus.RUNNING and worker_pid:
            break
        time.sleep(0.05)
    assert marker.is_file()
    assert worker_pid is not None and os.getpgid(worker_pid) == worker_pid
    os.killpg(worker_pid, signal.SIGKILL)
    time.sleep(0.1)

    assert runtime.catalog.interrupt_stale_jobs(stale_after_seconds=0) == 1
    interrupted = runtime.jobs.get(submitted["id"])
    assert interrupted.status == JobStatus.INTERRUPTED
    assert interrupted.error and interrupted.error["code"] == "WORKER_HEARTBEAT_LOST"
    assert interrupted.error["retryable"] is True

    recovered_runtime = Runtime.create(
        replace(settings, ffmpeg="ffmpeg", job_inline=True, min_free_bytes=0)
    )
    recovered = recovered_runtime.jobs.retry(interrupted.id, run_inline=True)
    assert recovered.status == JobStatus.SUCCEEDED
    assert recovered.result and Path(recovered.result["path"]).is_file()
