"""Fast dependency and storage diagnostics that never imports model runtimes."""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
from importlib.resources import files
from pathlib import Path
from typing import Any

from voxflow import __version__
from voxflow.settings import Settings


def doctor(settings: Settings) -> dict[str, Any]:
    settings.ensure()
    ffmpeg_available = shutil.which(settings.ffmpeg) is not None
    ffprobe_available = shutil.which(settings.ffprobe) is not None
    disk = shutil.disk_usage(settings.home)
    checks: dict[str, Any] = {
        "python": {
            "ok": (3, 11) <= sys.version_info[:2] < (3, 13),
            "version": ".".join(map(str, sys.version_info[:3])),
            "required": ">=3.11,<3.13",
        },
        "ffmpeg": {"ok": ffmpeg_available, "command": settings.ffmpeg},
        "ffprobe": {
            "ok": ffprobe_available,
            "command": settings.ffprobe,
        },
        "codecs": _codec_check(settings.ffmpeg) if ffmpeg_available else {"ok": False},
        "storage": {
            "ok": (
                settings.home.is_dir()
                and _writable(settings.home)
                and disk.free >= settings.min_free_bytes
            ),
            "path": str(settings.home),
            "free_bytes": disk.free,
            "min_free_bytes": settings.min_free_bytes,
        },
        "schemas": _schema_check(),
        "mcp": {"ok": importlib.util.find_spec("mcp") is not None, "optional": True},
        "funasr": {
            "ok": importlib.util.find_spec("funasr") is not None,
            "optional": True,
            "loaded": "funasr" in sys.modules,
            "provider": "local-funasr",
        },
        "tts": {
            "ok": settings.tts_provider == "fake" or bool(settings.tts_service_url),
            "optional": True,
            "provider": settings.tts_provider,
            "service_configured": bool(settings.tts_service_url),
        },
    }
    required_ok = all(
        checks[key]["ok"] for key in ("python", "ffmpeg", "ffprobe", "codecs", "storage", "schemas")
    )
    return {
        "status": "healthy" if required_ok else "degraded",
        "version": __version__,
        "offline": True,
        "auth_required": False,
        "checks": checks,
    }


def _writable(path: Path) -> bool:
    try:
        probe = path / ".doctor-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False


def _codec_check(ffmpeg: str) -> dict[str, Any]:
    required = {"libx264", "aac", "libmp3lame", "pcm_s16le"}
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return {"ok": False, "required": sorted(required), "missing": sorted(required)}
    available = {codec for codec in required if codec in result.stdout}
    missing = sorted(required - available)
    return {
        "ok": result.returncode == 0 and not missing,
        "required": sorted(required),
        "missing": missing,
    }


def _schema_check() -> dict[str, Any]:
    expected = {
        "artifact-v1.schema.json",
        "edit-plan-v1.schema.json",
        "job-v1.schema.json",
        "project-v1.schema.json",
        "render-plan-v1.schema.json",
        "timeline-v1.schema.json",
        "transcript-v1.schema.json",
    }
    schema_dir = files("voxflow").joinpath("schemas")
    invalid: list[str] = []
    for name in sorted(expected):
        try:
            payload = json.loads(schema_dir.joinpath(name).read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or "$defs" not in payload:
                invalid.append(name)
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            invalid.append(name)
    return {"ok": not invalid, "count": len(expected) - len(invalid), "invalid": invalid}
