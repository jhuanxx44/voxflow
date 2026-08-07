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
    tts_provider: str = "indextts"
    tts_service_url: str = ""
    tts_default_prompt_audio: str = "examples/xiaolin.wav"
    tts_timeout_seconds: int = 180
    tts_min_stretch_ratio: float = 0.8
    tts_max_stretch_ratio: float = 1.25
    min_free_bytes: int = 256 * 1024 * 1024
    candidate_ttl_seconds: int = 7 * 24 * 60 * 60
    cache_ttl_seconds: int = 30 * 24 * 60 * 60
    temporary_ttl_seconds: int = 24 * 60 * 60

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
            tts_provider=os.environ.get("VOXFLOW_TTS_PROVIDER", "indextts"),
            tts_service_url=os.environ.get("TTS_SERVICE_URL", ""),
            tts_default_prompt_audio=os.environ.get(
                "TTS_DEFAULT_PROMPT_AUDIO", "examples/xiaolin.wav"
            ),
            tts_timeout_seconds=int(os.environ.get("VOXFLOW_TTS_TIMEOUT_SECONDS", "180")),
            tts_min_stretch_ratio=float(os.environ.get("VOXFLOW_TTS_MIN_STRETCH", "0.8")),
            tts_max_stretch_ratio=float(os.environ.get("VOXFLOW_TTS_MAX_STRETCH", "1.25")),
            min_free_bytes=int(os.environ.get("VOXFLOW_MIN_FREE_BYTES", str(256 * 1024 * 1024))),
            candidate_ttl_seconds=int(
                os.environ.get("VOXFLOW_CANDIDATE_TTL_SECONDS", str(7 * 24 * 60 * 60))
            ),
            cache_ttl_seconds=int(
                os.environ.get("VOXFLOW_CACHE_TTL_SECONDS", str(30 * 24 * 60 * 60))
            ),
            temporary_ttl_seconds=int(
                os.environ.get("VOXFLOW_TEMPORARY_TTL_SECONDS", str(24 * 60 * 60))
            ),
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
    def web_uploads_dir(self) -> Path:
        return self.home / "web-uploads"

    @property
    def tts_cache_dir(self) -> Path:
        return self.home / "tts-cache"

    @property
    def catalog_path(self) -> Path:
        return self.home / "catalog.sqlite"

    @property
    def logs_dir(self) -> Path:
        return self.home / "logs"

    @property
    def events_log_path(self) -> Path:
        return self.logs_dir / "events.jsonl"

    def ensure(self) -> None:
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.asr_cache_dir.mkdir(parents=True, exist_ok=True)
        self.web_uploads_dir.mkdir(parents=True, exist_ok=True)
        self.tts_cache_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def worker_environment(self) -> dict[str, str]:
        """Serialize effective settings so detached workers cannot drift from submitters."""
        return {
            "VOXFLOW_HOME": str(self.home),
            "VOXFLOW_FFMPEG": self.ffmpeg,
            "VOXFLOW_FFPROBE": self.ffprobe,
            "VOXFLOW_ALLOWED_INPUT_ROOTS": os.pathsep.join(map(str, self.allowed_input_roots)),
            "VOXFLOW_MAX_INPUT_BYTES": str(self.max_input_bytes),
            "VOXFLOW_MAX_MEDIA_DURATION_MS": str(self.max_media_duration_ms),
            "VOXFLOW_EXPORT_TIMEOUT_SECONDS": str(self.export_timeout_seconds),
            "VOXFLOW_TTS_PROVIDER": self.tts_provider,
            "TTS_SERVICE_URL": self.tts_service_url,
            "TTS_DEFAULT_PROMPT_AUDIO": self.tts_default_prompt_audio,
            "VOXFLOW_TTS_TIMEOUT_SECONDS": str(self.tts_timeout_seconds),
            "VOXFLOW_TTS_MIN_STRETCH": str(self.tts_min_stretch_ratio),
            "VOXFLOW_TTS_MAX_STRETCH": str(self.tts_max_stretch_ratio),
            "VOXFLOW_MIN_FREE_BYTES": str(self.min_free_bytes),
            "VOXFLOW_CANDIDATE_TTL_SECONDS": str(self.candidate_ttl_seconds),
            "VOXFLOW_CACHE_TTL_SECONDS": str(self.cache_ttl_seconds),
            "VOXFLOW_TEMPORARY_TTL_SECONDS": str(self.temporary_ttl_seconds),
        }
