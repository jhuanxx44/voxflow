from __future__ import annotations

from pathlib import Path
from typing import Any

from voxflow.application.runtime import Runtime
from voxflow.domain.models import Job, JobStatus
from voxflow.settings import Settings
from voxflow.worker import _transcribe, execute_job


class FakeASRProvider:
    def __init__(self, **_kwargs: Any) -> None:
        pass

    def recognize(self, source: Path, *, model: str, hotwords: str = "") -> Any:
        assert source.is_file()
        assert model == "advanced"
        return [
            {
                "text": "测试识别",
                "sentence_info": [
                    {
                        "text": "测试识别",
                        "start": 0,
                        "end": 1000,
                        "timestamp": [[0, 200], [200, 400], [400, 700], [700, 1000]],
                        "spk": 0,
                    }
                ],
            }
        ]


def test_transcription_worker_persists_normalized_transcript(
    settings: Settings, wav_file: Path, monkeypatch: Any
) -> None:
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file)
    job = Job(
        id="job_fixture_transcribe",
        kind="transcribe",
        project_id=project.id,
        status=JobStatus.RUNNING,
        request={"model": "advanced", "hotwords": ""},
    )
    runtime.catalog.upsert_job(job)
    monkeypatch.setattr("voxflow.worker.FunASRProvider", FakeASRProvider)
    result = _transcribe(job, runtime)
    assert result["segment_count"] == 1
    assert result["cache_hit"] is False
    transcript = runtime.store.get_transcript(project.id)
    assert transcript.segments[0].edit_precision == "token"
    assert transcript.segments[0].tokens[0].id.startswith("tok_")

    second_runtime = Runtime.create(settings)
    second_project = second_runtime.store.create(wav_file)
    second_job = Job(
        id="job_fixture_cached_transcribe",
        kind="transcribe",
        project_id=second_project.id,
        status=JobStatus.RUNNING,
        request={"model": "advanced", "hotwords": ""},
    )
    second_runtime.catalog.upsert_job(second_job)

    class ProviderMustNotRun:
        def __init__(self, **_kwargs: Any) -> None:
            raise AssertionError("provider should not be loaded on an ASR cache hit")

    monkeypatch.setattr("voxflow.worker.FunASRProvider", ProviderMustNotRun)
    cached = _transcribe(second_job, second_runtime)
    assert cached["cache_hit"] is True
    assert cached["cache_key"] == result["cache_key"]
    assert second_runtime.store.get_transcript(second_project.id).full_text == "测试识别"


def test_completed_transcription_job_and_transcript_survive_runtime_restart(
    settings: Settings, wav_file: Path, monkeypatch: Any
) -> None:
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file)
    job = Job(
        id="job_fixture_execute_transcribe",
        kind="transcribe",
        project_id=project.id,
        request={"model": "advanced", "hotwords": ""},
    )
    runtime.catalog.upsert_job(job)
    monkeypatch.setattr("voxflow.worker.FunASRProvider", FakeASRProvider)
    completed = execute_job(job.id, settings=settings)
    assert completed.status == JobStatus.SUCCEEDED

    restarted = Runtime.create(settings)
    persisted = restarted.jobs.get(job.id)
    assert persisted.status == JobStatus.SUCCEEDED
    assert persisted.result and persisted.result["segment_count"] == 1
    assert restarted.store.get_transcript(project.id).full_text == "测试识别"
