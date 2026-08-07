"""Detached local worker entry point for ASR and export jobs."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import threading
from pathlib import Path
from typing import Any

from voxflow.application.runtime import Runtime
from voxflow.domain.errors import JobCancelledError, StorageError, ValidationError
from voxflow.domain.ids import new_artifact_id
from voxflow.domain.models import Artifact, ArtifactKind, Job, utc_now
from voxflow.infrastructure.asr import FunASRProvider, normalize_asr_result
from voxflow.infrastructure.asr_cache import ASRCache
from voxflow.infrastructure.files import sha256_file
from voxflow.infrastructure.speech import extract_reference_audio, provider_from_settings
from voxflow.infrastructure.speech_cache import SpeechCache
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


def _speech_replace(job: Job, runtime: Runtime) -> dict[str, Any]:
    project = runtime.store.get(job.project_id)
    source = Path(project.source.managed_path)
    if not source.is_file() or sha256_file(source) != project.source.sha256:
        raise ValidationError("Source media is missing or changed after project creation")
    revision = runtime.store.get_timeline(project.id, int(job.request["expected_revision"]))
    clip_id = str(job.request["clip_id"])
    clip = next((item for item in revision.clips if item.id == clip_id), None)
    if clip is None:
        raise ValidationError("Speech replacement source clip no longer exists")
    from voxflow.domain.operations import clip_fingerprint

    fingerprint = clip_fingerprint(clip)
    if fingerprint != job.request.get("clip_fingerprint"):
        raise ValidationError("Speech replacement source clip fingerprint changed")

    provider = provider_from_settings(runtime.settings)
    reference_ranges = list(job.request.get("reference_ranges", []))
    reference_identity = hashlib.sha256(
        json.dumps(
            {
                "source_sha256": project.source.sha256,
                "ranges": reference_ranges,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    parameters = dict(job.request.get("parameters", {}))
    cache_config = {
        "provider": provider.name,
        "provider_version": provider.version,
        "provider_schema_version": 1,
        "voice_reference": reference_identity,
        "text": str(job.request["text"]),
        "parameters": parameters,
    }
    cache = SpeechCache(runtime.settings.tts_cache_dir)
    cache_key = cache.key(cache_config)
    artifact_id = new_artifact_id()
    replacements = runtime.store.project_dir(project.id) / "replacements"
    replacements.mkdir(parents=True, exist_ok=True)
    output_path = replacements / f"{artifact_id}.wav"
    partial_path = replacements / f"{artifact_id}.partial.wav"
    cached = cache.get(cache_key)
    cache_hit = cached is not None
    if cached:
        runtime.jobs.update(job, phase="cache_hit", progress=0.75)
        shutil.copy2(cached, partial_path)
        reference_path = None
    else:
        runtime.jobs.update(job, phase="extracting_reference", progress=0.1)
        reference_path = extract_reference_audio(
            source,
            reference_ranges,
            runtime.store.project_dir(project.id) / "logs" / f"{job.id}-reference.wav",
            ffmpeg=runtime.settings.ffmpeg,
        )
        if runtime.jobs.get(job.id).cancel_requested:
            raise JobCancelledError("Speech replacement was cancelled")
        runtime.jobs.update(job, phase="synthesizing", progress=0.3)
        try:
            provider.synthesize(
                text=str(job.request["text"]),
                output_path=partial_path,
                reference_path=reference_path,
                parameters=parameters,
            )
        except Exception:
            partial_path.unlink(missing_ok=True)
            raise
        cache.put(cache_key, partial_path, config=cache_config)
    media = runtime.store.probe.inspect(partial_path)
    if not media.has_audio or media.duration_ms <= 0:
        partial_path.unlink(missing_ok=True)
        raise ValidationError("TTS provider did not produce a valid audio artifact")
    os.replace(partial_path, output_path)

    source_duration_ms = int(job.request["source_duration_ms"])
    replacement_duration_ms = media.duration_ms
    stretch_ratio = source_duration_ms / replacement_duration_ms
    policy = str(job.request["duration_policy"])
    render_duration_ms = replacement_duration_ms if policy == "natural" else source_duration_ms
    warnings: list[str] = []
    safe_stretch = (
        runtime.settings.tts_min_stretch_ratio
        <= stretch_ratio
        <= runtime.settings.tts_max_stretch_ratio
    )
    if policy == "fit_source" and not safe_stretch:
        warnings.append(
            "fit_source stretch ratio "
            f"{stretch_ratio:.3f} is outside the safe range "
            f"{runtime.settings.tts_min_stretch_ratio:.2f}–"
            f"{runtime.settings.tts_max_stretch_ratio:.2f}"
        )
    if policy == "pad_or_trim":
        warnings.append("pad_or_trim may add silence or explicitly trim replacement audio")

    operation = {
        "op": "attach_speech_replacement",
        "clip_id": clip.id,
        "artifact_id": artifact_id,
        "clip_fingerprint": fingerprint,
        "text": str(job.request["text"]),
        "duration_policy": policy,
        "replacement_duration_ms": replacement_duration_ms,
        "render_duration_ms": render_duration_ms,
        "stretch_ratio": stretch_ratio,
    }
    artifact = Artifact(
        id=artifact_id,
        project_id=project.id,
        kind=ArtifactKind.REPLACEMENT_AUDIO,
        path=str(output_path),
        mime_type="audio/wav",
        size_bytes=output_path.stat().st_size,
        sha256=sha256_file(output_path),
        metadata={
            "candidate_schema_version": 1,
            "expected_revision": int(job.request["expected_revision"]),
            "clip_id": clip.id,
            "clip_fingerprint": fingerprint,
            "text": str(job.request["text"]),
            "provider": provider.name,
            "provider_version": provider.version,
            "voice_reference": reference_identity,
            "parameters": parameters,
            "cache_key": cache_key,
            "cache_hit": cache_hit,
            "duration_policy": policy,
            "source_duration_ms": source_duration_ms,
            "replacement_duration_ms": replacement_duration_ms,
            "render_duration_ms": render_duration_ms,
            "stretch_ratio": stretch_ratio,
            "safe_stretch": safe_stretch,
            "warnings": warnings,
            "recommended_operation": operation,
        },
    )
    runtime.store.register_artifact(artifact)
    return {
        "project_id": project.id,
        "revision": int(job.request["expected_revision"]),
        "artifact_id": artifact.id,
        "path": artifact.path,
        "duration_ms": replacement_duration_ms,
        "cache_hit": cache_hit,
        "safe_stretch": safe_stretch,
        "warnings": warnings,
        "recommended_operation": operation,
    }


def _dispatch(job: Job, runtime: Runtime) -> dict[str, Any]:
    free_bytes = shutil.disk_usage(runtime.settings.home).free
    if free_bytes < runtime.settings.min_free_bytes:
        raise StorageError(
            "Insufficient free space to run job",
            details={
                "free_bytes": free_bytes,
                "min_free_bytes": runtime.settings.min_free_bytes,
            },
        )
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
    if job.kind == "speech_replace":
        return _speech_replace(job, runtime)
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
