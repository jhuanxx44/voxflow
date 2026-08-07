from __future__ import annotations

import json
import subprocess
import wave
from dataclasses import replace
from pathlib import Path
from typing import Any, Literal, TypeAlias

import pytest

from voxflow.application.runtime import Runtime
from voxflow.domain.errors import ValidationError
from voxflow.domain.models import JobStatus
from voxflow.domain.operations import EditPlan
from voxflow.infrastructure.speech import FakeSpeechProvider
from voxflow.settings import Settings

DurationPolicy: TypeAlias = Literal["natural", "fit_source", "pad_or_trim"]


def _runtime(settings: Settings) -> Runtime:
    return Runtime.create(replace(settings, tts_provider="fake"))


def _create_transcribed(runtime: Runtime, source: Path) -> tuple[str, str]:
    project = runtime.store.create(source)
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
    return project.id, runtime.store.get_timeline(project.id).clips[0].id


def _candidate(
    runtime: Runtime,
    project_id: str,
    clip_id: str,
    *,
    duration_ms: int,
    policy: DurationPolicy | None = None,
    text: str = "替换语音",
) -> dict[str, Any]:
    submitted = runtime.speech.start(
        project_id,
        expected_revision=runtime.store.get(project_id).revision,
        clip_id=clip_id,
        text=text,
        duration_policy=policy,
        parameters={"fake_duration_ms": duration_ms},
        run_inline=True,
    )
    assert submitted["status"] == JobStatus.SUCCEEDED.value, submitted.get("error")
    assert submitted["result"]
    return dict(submitted["result"])


def _attach_plan(
    project_id: str,
    revision: int,
    operation: dict[str, Any],
    request_id: str,
) -> EditPlan:
    return EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": revision,
            "client_request_id": request_id,
            "reason": "attach generated speech",
            "operations": [operation],
        }
    )


def _probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def test_candidate_cache_restart_attach_and_audio_natural_render(
    settings: Settings, wav_file: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class CountingProvider(FakeSpeechProvider):
        calls = 0

        def synthesize(self, **kwargs: Any) -> None:
            self.calls += 1
            super().synthesize(**kwargs)

    provider = CountingProvider()
    monkeypatch.setattr("voxflow.worker.provider_from_settings", lambda _settings: provider)
    runtime = _runtime(settings)
    project_id, clip_id = _create_transcribed(runtime, wav_file)
    first = _candidate(runtime, project_id, clip_id, duration_ms=1500)
    assert first["cache_hit"] is False
    assert first["duration_ms"] == 1500
    artifact_path = Path(first["path"])
    assert artifact_path.is_file()

    second = _candidate(runtime, project_id, clip_id, duration_ms=1500)
    assert second["cache_hit"] is True
    assert second["artifact_id"] != first["artifact_id"]
    assert provider.calls == 1

    restarted = _runtime(settings)
    artifact = restarted.catalog.get_artifact(second["artifact_id"])
    assert artifact and Path(artifact.path).is_file()
    operation = dict(second["recommended_operation"])
    plan = _attach_plan(project_id, 1, operation, "attach-natural")
    preview = restarted.edits.preview(plan)
    assert preview.diff.duration_before_ms == 2000
    assert preview.diff.duration_after_ms == 2500
    restarted.edits.apply(plan)
    attached = restarted.store.get_timeline(project_id).clips[0]
    assert attached.kind == "replacement"
    assert attached.replacement_artifact_id == second["artifact_id"]

    output = tmp_path / "natural-replacement.wav"
    export = restarted.exports.start(project_id, output_format="wav", out=output, run_inline=True)
    assert export["status"] == JobStatus.SUCCEEDED.value, export.get("error")
    assert abs(_probe_duration(output) - 2.5) <= 0.04

    with wave.open(str(output), "rb") as rendered:
        assert rendered.getnchannels() == 2
        frames = rendered.readframes(round(rendered.getframerate() * 0.8))
        samples = memoryview(frames).cast("h")[::2]
        crossings = sum(
            1
            for previous, current in zip(samples, samples[1:], strict=False)
            if previous <= 0 < current
        )
    assert 250 <= crossings / 0.8 <= 410


def test_stale_fingerprint_and_candidate_metadata_tampering_are_rejected(
    settings: Settings, wav_file: Path
) -> None:
    runtime = _runtime(settings)
    project_id, clip_id = _create_transcribed(runtime, wav_file)
    candidate = _candidate(runtime, project_id, clip_id, duration_ms=1000)
    operation = dict(candidate["recommended_operation"])

    tampered_operation = dict(operation)
    tampered_operation["replacement_duration_ms"] += 1
    with pytest.raises(ValidationError, match="does not match its candidate artifact"):
        runtime.edits.preview(
            _attach_plan(project_id, 1, tampered_operation, "tampered-client-metadata")
        )

    artifact = runtime.catalog.get_artifact(candidate["artifact_id"])
    assert artifact is not None
    tampered_artifact = artifact.model_copy(deep=True)
    tampered_artifact.metadata["text"] = "篡改后的 artifact metadata"
    runtime.store.register_artifact(tampered_artifact)
    with pytest.raises(ValidationError, match="does not match its candidate artifact"):
        runtime.edits.preview(_attach_plan(project_id, 1, operation, "tampered-artifact-metadata"))
    runtime.store.register_artifact(artifact)

    correction = EditPlan.model_validate(
        {
            "project_id": project_id,
            "expected_revision": 1,
            "client_request_id": "change-source-clip",
            "operations": [{"op": "correct_transcript", "clip_id": clip_id, "text": "外部修订"}],
        }
    )
    runtime.edits.apply(correction)
    with pytest.raises(ValidationError, match="no longer matches the clip"):
        runtime.edits.preview(_attach_plan(project_id, 2, operation, "stale-fingerprint"))


def test_unsafe_video_fit_source_warns_then_rejects_and_pad_or_trim_applies(
    settings: Settings, video_file: Path
) -> None:
    runtime = _runtime(settings)
    project_id, clip_id = _create_transcribed(runtime, video_file)
    unsafe = _candidate(
        runtime,
        project_id,
        clip_id,
        duration_ms=4000,
        policy="fit_source",
    )
    assert unsafe["safe_stretch"] is False
    unsafe_plan = _attach_plan(
        project_id, 1, dict(unsafe["recommended_operation"]), "unsafe-fit-source"
    )
    preview = runtime.edits.preview(unsafe_plan)
    assert preview.diff.warnings
    with pytest.raises(ValidationError, match="Unsafe fit_source stretch"):
        runtime.edits.apply(unsafe_plan)

    explicit = _candidate(
        runtime,
        project_id,
        clip_id,
        duration_ms=4000,
        policy="pad_or_trim",
    )
    explicit_plan = _attach_plan(
        project_id, 1, dict(explicit["recommended_operation"]), "explicit-pad-or-trim"
    )
    explicit_preview = runtime.edits.preview(explicit_plan)
    assert any("explicitly trim" in warning for warning in explicit_preview.diff.warnings)
    applied = runtime.edits.apply(explicit_plan)
    assert applied["revision"] == 2
    assert runtime.store.get_timeline(project_id).clips[0].replacement_warnings


def test_safe_video_fit_source_renders_matching_audio_video_duration(
    settings: Settings, video_file: Path, tmp_path: Path
) -> None:
    runtime = _runtime(settings)
    project_id, clip_id = _create_transcribed(runtime, video_file)
    candidate = _candidate(
        runtime,
        project_id,
        clip_id,
        duration_ms=1200,
        policy="fit_source",
    )
    assert candidate["safe_stretch"] is True
    runtime.edits.apply(
        _attach_plan(project_id, 1, dict(candidate["recommended_operation"]), "safe-fit-source")
    )
    output = tmp_path / "fit-source.mp4"
    export = runtime.exports.start(project_id, output_format="mp4", out=output, run_inline=True)
    assert export["status"] == JobStatus.SUCCEEDED.value, export.get("error")
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,duration",
            "-of",
            "json",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(probe.stdout)
    assert {stream["codec_type"] for stream in payload["streams"]} == {"audio", "video"}
    assert abs(float(payload["format"]["duration"]) - 2.0) <= 0.15
    stream_durations = [float(stream["duration"]) for stream in payload["streams"]]
    assert max(stream_durations) - min(stream_durations) <= 0.15
