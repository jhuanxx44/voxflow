from __future__ import annotations

import math
import struct
import subprocess
import wave
from pathlib import Path

import pytest

from voxflow.settings import Settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(home=tmp_path / "voxflow-home", job_inline=True)


@pytest.fixture
def wav_file(tmp_path: Path) -> Path:
    path = tmp_path / "tone.wav"
    sample_rate = 16_000
    duration = 5
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        frames = bytearray()
        for index in range(sample_rate * duration):
            sample = int(8000 * math.sin(2 * math.pi * 440 * index / sample_rate))
            frames.extend(struct.pack("<h", sample))
        output.writeframes(frames)
    return path


@pytest.fixture
def video_file(tmp_path: Path) -> Path:
    path = tmp_path / "fixture.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x240:d=5:r=25",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=5:sample_rate=16000",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        check=True,
        timeout=60,
    )
    return path


@pytest.fixture
def video_without_audio_file(tmp_path: Path) -> Path:
    path = tmp_path / "fixture-video-only.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=320x240:d=5:r=25",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
        timeout=60,
    )
    return path
