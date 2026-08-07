"""ffprobe-backed media inspection and dependency checks."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from voxflow.domain.errors import DependencyError, ValidationError
from voxflow.domain.models import MediaInfo


class MediaProbe:
    def __init__(self, ffprobe: str = "ffprobe") -> None:
        self.ffprobe = ffprobe

    def available(self) -> bool:
        return shutil.which(self.ffprobe) is not None

    def inspect(self, path: Path) -> MediaInfo:
        if not self.available():
            raise DependencyError("ffprobe is not installed or not on PATH")
        result = subprocess.run(
            [
                self.ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration,format_name:stream=codec_type,codec_name,width,height",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if result.returncode != 0:
            raise ValidationError(
                "Input is not a readable media file",
                details={"path": str(path), "ffprobe": result.stderr[-1000:]},
            )
        payload = json.loads(result.stdout)
        streams = payload.get("streams", [])
        video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
        audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
        duration_ms = round(float(payload.get("format", {}).get("duration", 0)) * 1000)
        if not audio and not video:
            raise ValidationError(
                "Media file does not contain an audio or video stream",
                details={"path": str(path)},
            )
        return MediaInfo(
            duration_ms=duration_ms,
            has_video=video is not None,
            has_audio=audio is not None,
            video_codec=video.get("codec_name") if video else None,
            audio_codec=audio.get("codec_name") if audio else None,
            width=video.get("width") if video else None,
            height=video.get("height") if video else None,
            format_name=payload.get("format", {}).get("format_name"),
        )
