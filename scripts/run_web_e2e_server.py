"""Run an isolated VoxFlow Web backend with deterministic ASR for Playwright."""

from __future__ import annotations

import atexit
import math
import os
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / ".e2e" / "fixtures"
HOME = Path(tempfile.mkdtemp(prefix="voxflow-web-e2e-"))
sys.path.insert(0, str(ROOT))

os.environ["VOXFLOW_HOME"] = str(HOME)
os.environ["VOXFLOW_JOB_INLINE"] = "1"
os.environ["VOXFLOW_WEB_HOST"] = "127.0.0.1"
os.environ["VOXFLOW_WEB_PORT"] = "8082"


def _write_fixtures() -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = FIXTURE_DIR / "deterministic.wav"
    sample_rate = 16_000
    with wave.open(str(wav_path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        frames = bytearray()
        for index in range(sample_rate * 5):
            sample = int(6000 * math.sin(2 * math.pi * 440 * index / sample_rate))
            frames.extend(struct.pack("<h", sample))
        output.writeframes(frames)

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
            str(FIXTURE_DIR / "deterministic.mp4"),
        ],
        check=True,
        timeout=60,
    )


class DeterministicASRProvider:
    """Test-only provider that preserves the real job and normalization path."""

    def __init__(self, *, ffmpeg: str = "ffmpeg") -> None:
        self.ffmpeg = ffmpeg

    @staticmethod
    def _timestamps(start: int, end: int, count: int) -> list[list[int]]:
        return [
            [start + (end - start) * index // count, start + (end - start) * (index + 1) // count]
            for index in range(count)
        ]

    def recognize(self, source: Path, *, model: str, hotwords: str = "") -> Any:
        del source, model, hotwords
        return [
            {
                "text": "欢迎使用 VoxFlow。稳定标识让编辑可以被智能体安全执行。",
                "sentence_info": [
                    {
                        "text": "欢迎使用 VoxFlow。",
                        "start": 0,
                        "end": 1100,
                        "spk": 0,
                        "timestamp": self._timestamps(0, 1100, 5),
                    },
                    {
                        "text": "稳定标识让编辑安全。",
                        "start": 1100,
                        "end": 2300,
                        "spk": 1,
                        "timestamp": self._timestamps(1100, 2300, 9),
                    },
                    {
                        "text": "刷新之后修改仍然存在。",
                        "start": 2300,
                        "end": 3500,
                        "spk": 0,
                        "timestamp": self._timestamps(2300, 3500, 10),
                    },
                    {
                        "text": "最后导出真实媒体文件。",
                        "start": 3500,
                        "end": 4800,
                        "spk": 1,
                        "timestamp": self._timestamps(3500, 4800, 10),
                    },
                ],
            }
        ]


def main() -> None:
    _write_fixtures()
    atexit.register(lambda: __import__("shutil").rmtree(HOME, ignore_errors=True))
    import voxflow.worker as worker

    worker.FunASRProvider = DeterministicASRProvider  # type: ignore[misc]
    from app import app

    app.run(host="127.0.0.1", port=8082, debug=False, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
