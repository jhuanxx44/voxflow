"""Privacy-preserving diagnostics bundle generation."""

from __future__ import annotations

import json
import os
import platform
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

from voxflow import __version__
from voxflow.application.doctor import doctor
from voxflow.application.jobs import JobService
from voxflow.settings import Settings

_SECRET = re.compile(r"(?i)(api[_-]?key|token|secret|password|authorization)")
_SAFE_ERROR_DETAILS = {
    "attempt",
    "error_type",
    "free_bytes",
    "min_free_bytes",
    "returncode",
    "status",
    "timeout",
    "timeout_seconds",
    "worker_pid",
}


class DiagnosticsService:
    def __init__(self, settings: Settings, jobs: JobService) -> None:
        self.settings = settings
        self.jobs = jobs

    def create(self, output: Path) -> dict[str, Any]:
        destination = output.expanduser().resolve()
        if destination.exists() and destination.is_dir():
            raise ValueError("Diagnostics --out must be a zip file path")
        if destination.exists():
            raise ValueError("Diagnostics --out already exists; choose a new file path")
        destination.parent.mkdir(parents=True, exist_ok=True)
        state = doctor(self.settings)
        state["checks"]["storage"]["path"] = "<VOXFLOW_HOME>"
        for executable in ("ffmpeg", "ffprobe"):
            command = str(state["checks"][executable]["command"])
            state["checks"][executable]["command"] = Path(command).name

        jobs = self.jobs.list(limit=100)["items"]
        files = {
            "manifest.json": {
                "bundle_schema_version": 1,
                "voxflow_version": __version__,
                "platform": platform.system().lower(),
                "platform_release": platform.release(),
                "python_version": ".".join(map(str, sys.version_info[:3])),
                "contains_media": False,
                "contains_transcript": False,
                "contains_job_requests": False,
                "files": ["config.json", "doctor.json", "jobs.json", "events.json"],
            },
            "config.json": self._safe_config(),
            "doctor.json": _scrub(state, self.settings.home),
            "jobs.json": [self._safe_job(job) for job in jobs],
            "events.json": self._safe_events(),
        }
        temporary = destination.with_suffix(destination.suffix + ".partial")
        temporary.unlink(missing_ok=True)
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, payload in files.items():
                archive.writestr(
                    name,
                    json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                )
        os.replace(temporary, destination)
        return {
            "path": str(destination),
            "size_bytes": destination.stat().st_size,
            "bundle_schema_version": 1,
            "files": sorted(files),
            "redacted": True,
        }

    def _safe_config(self) -> dict[str, Any]:
        return {
            "home": "<VOXFLOW_HOME>",
            "allowed_input_roots_count": len(self.settings.allowed_input_roots),
            "job_inline": self.settings.job_inline,
            "max_input_bytes": self.settings.max_input_bytes,
            "max_media_duration_ms": self.settings.max_media_duration_ms,
            "export_timeout_seconds": self.settings.export_timeout_seconds,
            "tts_provider": self.settings.tts_provider,
            "tts_service_configured": bool(self.settings.tts_service_url),
            "tts_timeout_seconds": self.settings.tts_timeout_seconds,
            "min_free_bytes": self.settings.min_free_bytes,
            "candidate_ttl_seconds": self.settings.candidate_ttl_seconds,
            "cache_ttl_seconds": self.settings.cache_ttl_seconds,
            "temporary_ttl_seconds": self.settings.temporary_ttl_seconds,
        }

    def _safe_job(self, job: dict[str, Any]) -> dict[str, Any]:
        error = job.get("error")
        safe_error: dict[str, Any] | None = None
        if isinstance(error, dict):
            details = error.get("details")
            safe_error = {
                "code": error.get("code"),
                "message": _scrub(error.get("message"), self.settings.home),
                "retryable": bool(error.get("retryable")),
                "details": {
                    key: _scrub(value, self.settings.home)
                    for key, value in details.items()
                    if key in _SAFE_ERROR_DETAILS and not _SECRET.search(key)
                }
                if isinstance(details, dict)
                else {},
            }
        return {
            "id": job.get("id"),
            "project_id": job.get("project_id"),
            "kind": job.get("kind"),
            "status": job.get("status"),
            "phase": job.get("phase"),
            "progress": job.get("progress"),
            "attempt": job.get("attempt"),
            "created_at": job.get("created_at"),
            "started_at": job.get("started_at"),
            "finished_at": job.get("finished_at"),
            "error": safe_error,
        }

    def _safe_events(self) -> list[dict[str, Any]]:
        path = self.settings.events_log_path
        if not path.is_file():
            return []
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-200:]
        events: list[dict[str, Any]] = []
        for line in lines:
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                events.append(_scrub(payload, self.settings.home))
        return events


def _scrub(value: Any, home: Path) -> Any:
    if isinstance(value, dict):
        return {
            key: "<redacted>" if _SECRET.search(str(key)) else _scrub(item, home)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_scrub(item, home) for item in value]
    if isinstance(value, str):
        cleaned = value.replace(str(home), "<VOXFLOW_HOME>")
        cleaned = re.sub(r"(?<![A-Za-z0-9])/(?:[^\s,;]+)", "<redacted-path>", cleaned)
        cleaned = re.sub(r"[A-Za-z]:[\\/](?:[^\s,;]+)", "<redacted-path>", cleaned)
        return cleaned
    return value
