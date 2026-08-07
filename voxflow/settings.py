"""Runtime settings with a single, testable VoxFlow home directory."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from platformdirs import user_data_path


@dataclass(frozen=True)
class Settings:
    home: Path
    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"
    job_inline: bool = False
    allowed_input_roots: tuple[Path, ...] = ()
    max_input_bytes: int = 100 * 1024 * 1024 * 1024
    max_media_duration_ms: int = 24 * 60 * 60 * 1000
    export_timeout_seconds: int = 3600

    @classmethod
    def from_env(cls) -> Settings:
        configured = os.environ.get("VOXFLOW_HOME")
        home = Path(configured).expanduser() if configured else user_data_path("voxflow")
        configured_roots = os.environ.get("VOXFLOW_ALLOWED_INPUT_ROOTS", "")
        allowed_input_roots = tuple(
            Path(item.strip()).expanduser().resolve()
            for item in configured_roots.split(os.pathsep)
            if item.strip()
        )
        return cls(
            home=home.resolve(),
            ffmpeg=os.environ.get("VOXFLOW_FFMPEG", "ffmpeg"),
            ffprobe=os.environ.get("VOXFLOW_FFPROBE", "ffprobe"),
            job_inline=os.environ.get("VOXFLOW_JOB_INLINE", "").lower()
            in {"1", "true", "yes", "on"},
            allowed_input_roots=allowed_input_roots,
            max_input_bytes=int(
                os.environ.get("VOXFLOW_MAX_INPUT_BYTES", str(100 * 1024 * 1024 * 1024))
            ),
            max_media_duration_ms=int(
                os.environ.get("VOXFLOW_MAX_MEDIA_DURATION_MS", str(24 * 60 * 60 * 1000))
            ),
            export_timeout_seconds=int(os.environ.get("VOXFLOW_EXPORT_TIMEOUT_SECONDS", "3600")),
        )

    @property
    def projects_dir(self) -> Path:
        return self.home / "projects"

    @property
    def jobs_dir(self) -> Path:
        return self.home / "jobs"

    @property
    def asr_cache_dir(self) -> Path:
        return self.home / "asr-cache"

    @property
    def catalog_path(self) -> Path:
        return self.home / "catalog.sqlite"

    def ensure(self) -> None:
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.asr_cache_dir.mkdir(parents=True, exist_ok=True)
