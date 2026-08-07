"""Detached local worker entry point for ASR and export jobs."""

from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
from typing import Any

from voxflow.application.runtime import Runtime
from voxflow.domain.errors import JobCancelledError, ValidationError
from voxflow.domain.models import Job, utc_now
from voxflow.infrastructure.asr import FunASRProvider, normalize_asr_result
from voxflow.infrastructure.asr_cache import ASRCache
from voxflow.infrastructure.files import sha256_file
from voxflow.settings import Settings


def _transcribe(job: Job, runtime: Runtime) -> dict[str, Any]:
    project = runtime.store.get(job.project_id)
    source = Path(project.source.managed_path)
    if not source.is_file():
        raise ValidationError("Managed source file is missing", details={"path": str(source)})
    if sha256_file(source) != project.source.sha256:
        raise ValidationError("Source media changed after project creation")
    if not project.source.media.has_audio:
        raise ValidationError("ASR requires source media with an audio stream")
    model = str(job.request.get("model", "advanced"))
    hotwords = str(job.request.get("hotwords", ""))
    if model not in {"basic", "advanced"}:
        raise ValidationError(
            "Unsupported ASR model", details={"model": model, "supported": ["basic", "advanced"]}
        )
    cache_config = {
        "provider": "funasr",
        "provider_schema_version": 1,
        "model": model,
        "hotwords": hotwords,
    }
    cache = ASRCache(runtime.settings.asr_cache_dir)
    cache_key = cache.key(project.source.sha256, cache_config)
    runtime.store.set_transcript_running(project.id, job.id, model)
    payload = cache.get(cache_key)
    cache_hit = payload is not None
    if cache_hit:
        runtime.jobs.update(job, phase="cache_hit", progress=0.8)
    else:
        runtime.jobs.update(job, phase="loading_model", progress=0.05)
        provider = FunASRProvider(ffmpeg=runtime.settings.ffmpeg)
        payload = provider.recognize(source, model=model, hotwords=hotwords)
        cache.put(
            cache_key,
            source_sha256=project.source.sha256,
            config=cache_config,
            payload=payload,
        )
    if runtime.jobs.get(job.id).cancel_requested:
        raise JobCancelledError("Transcription was cancelled before committing its transcript")
    runtime.jobs.update(job, phase="normalizing", progress=0.85)
    transcript = normalize_asr_result(project.id, payload, model=model)
    saved = runtime.store.save_transcript(transcript, job_id=job.id)
    return {
        "project_id": project.id,
        "revision": saved.revision,
        "segment_count": len(transcript.segments),
        "cache_hit": cache_hit,
        "cache_key": cache_key,
    }


def _dispatch(job: Job, runtime: Runtime) -> dict[str, Any]:
    if job.kind == "transcribe":
        try:
            return _transcribe(job, runtime)
        except JobCancelledError:
            runtime.store.set_transcript_cancelled(job.project_id, job.id)
            raise
        except Exception as error:
            if hasattr(error, "as_dict"):
                runtime.store.set_transcript_failed(job.project_id, job.id, error.as_dict())
            raise
    if job.kind == "export":
        from voxflow.infrastructure.renderer import execute_export_job

        return execute_export_job(job, runtime)
    raise ValidationError("Unknown job kind", details={"kind": job.kind})


def execute_job(job_id: str, *, settings: Settings | None = None) -> Job:
    runtime = Runtime.create(settings)
    claimed = runtime.catalog.claim_job(job_id, os.getpid())
    if not claimed:
        return runtime.jobs.get(job_id)
    stopped = threading.Event()

    def heartbeat() -> None:
        while not stopped.wait(10):
            latest = runtime.catalog.get_job(job_id)
            if not latest or latest.status.value != "running":
                return
            latest.heartbeat_at = utc_now()
            runtime.catalog.upsert_job(latest)

    heartbeat_thread = threading.Thread(target=heartbeat, name=f"heartbeat-{job_id}", daemon=True)
    heartbeat_thread.start()
    try:
        return runtime.jobs.run_claimed(claimed, lambda job, _jobs: _dispatch(job, runtime))
    finally:
        stopped.set()
        heartbeat_thread.join(timeout=1)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m voxflow.worker <job-id>")
    job = execute_job(sys.argv[1])
    raise SystemExit(0 if job.status.value == "succeeded" else 1)


if __name__ == "__main__":
    main()
