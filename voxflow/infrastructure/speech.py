"""Lazy TTS providers and reference-audio extraction."""

from __future__ import annotations

import math
import shutil
import struct
import subprocess
import time
import wave
from pathlib import Path
from typing import Protocol

from voxflow.domain.errors import DependencyError, ValidationError
from voxflow.settings import Settings


class SpeechProvider(Protocol):
    name: str
    version: str

    def synthesize(
        self,
        *,
        text: str,
        output_path: Path,
        reference_path: Path | None,
        parameters: dict[str, object],
    ) -> None: ...


class FakeSpeechProvider:
    """Deterministic provider used only when explicitly configured for tests."""

    name = "fake"
    version = "1"

    def synthesize(
        self,
        *,
        text: str,
        output_path: Path,
        reference_path: Path | None,
        parameters: dict[str, object],
    ) -> None:
        del reference_path
        requested = parameters.get("fake_duration_ms")
        if requested is None:
            duration_ms = max(300, len(text) * 180)
        elif isinstance(requested, (int, float, str)):
            duration_ms = int(requested)
        else:
            raise ValidationError("fake_duration_ms must be a number or numeric string")
        if duration_ms <= 0:
            raise ValidationError("fake_duration_ms must be greater than zero")
        sample_rate = 16_000
        with wave.open(str(output_path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(sample_rate)
            frames = bytearray()
            for index in range(round(sample_rate * duration_ms / 1000)):
                sample = int(5000 * math.sin(2 * math.pi * 330 * index / sample_rate))
                frames.extend(struct.pack("<h", sample))
            output.writeframes(frames)


class IndexTTSProvider:
    name = "indextts"
    version = "api-v1"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def synthesize(
        self,
        *,
        text: str,
        output_path: Path,
        reference_path: Path | None,
        parameters: dict[str, object],
    ) -> None:
        del parameters
        if not self.settings.tts_service_url:
            raise DependencyError("TTS_SERVICE_URL is not configured")
        try:
            import requests
        except ImportError as error:
            raise DependencyError(
                "IndexTTS provider requires the 'tts' dependency extra"
            ) from error

        prompt_audio = self.settings.tts_default_prompt_audio
        if reference_path is not None:
            with reference_path.open("rb") as handle:
                upload = requests.post(
                    f"{self.settings.tts_service_url}/api/v1/upload-prompt",
                    files={"file": (reference_path.name, handle, "audio/wav")},
                    timeout=30,
                )
            if upload.ok:
                prompt_audio = str(upload.json().get("path") or prompt_audio)

        response = requests.post(
            f"{self.settings.tts_service_url}/api/v1/tts/tasks",
            json={"text": text, "prompt_audio": prompt_audio, "return_audio": True},
            timeout=self.settings.tts_timeout_seconds,
        )
        if response.ok and "audio" in response.headers.get("Content-Type", ""):
            output_path.write_bytes(response.content)
            return
        if not response.ok:
            raise ValidationError(
                "TTS provider request failed",
                details={"status": response.status_code, "response": response.text[:500]},
            )
        task_id = response.json().get("task_id")
        if not task_id:
            raise ValidationError("TTS provider returned neither audio nor task_id")
        deadline = time.monotonic() + self.settings.tts_timeout_seconds
        while time.monotonic() < deadline:
            status = requests.get(
                f"{self.settings.tts_service_url}/api/v1/tts/tasks/{task_id}", timeout=10
            )
            if status.ok and status.json().get("status") == "completed":
                result = requests.get(
                    f"{self.settings.tts_service_url}/api/v1/tts/tasks/{task_id}/result",
                    timeout=30,
                )
                if result.ok:
                    output_path.write_bytes(result.content)
                    return
            if status.ok and status.json().get("status") == "failed":
                raise ValidationError(
                    "TTS generation failed",
                    details={"message": status.json().get("message", "unknown")},
                )
            time.sleep(1)
        raise ValidationError(
            "TTS generation timed out",
            details={"timeout_seconds": self.settings.tts_timeout_seconds},
        )


def provider_from_settings(settings: Settings) -> SpeechProvider:
    if settings.tts_provider == "fake":
        return FakeSpeechProvider()
    if settings.tts_provider == "indextts":
        return IndexTTSProvider(settings)
    raise ValidationError("Unsupported TTS provider", details={"provider": settings.tts_provider})


def extract_reference_audio(
    source: Path,
    ranges: list[dict[str, int]],
    output_path: Path,
    *,
    ffmpeg: str,
) -> Path | None:
    if not ranges:
        return None
    if shutil.which(ffmpeg) is None:
        raise DependencyError("ffmpeg is required to extract TTS reference audio")
    filters: list[str] = []
    for index, item in enumerate(ranges):
        start = item["start_ms"] / 1000
        end = item["end_ms"] / 1000
        filters.append(f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[r{index}]")
    inputs = "".join(f"[r{index}]" for index in range(len(ranges)))
    filters.append(f"{inputs}concat=n={len(ranges)}:v=0:a=1[ref]")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-i",
            str(source),
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[ref]",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ],
        capture_output=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise ValidationError(
            "Failed to extract TTS reference audio",
            details={"stderr": result.stderr.decode(errors="replace")[-1000:]},
        )
    return output_path
