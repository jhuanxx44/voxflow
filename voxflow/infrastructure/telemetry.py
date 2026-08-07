"""Small dependency-free JSONL event logger with a deliberately bounded vocabulary."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from filelock import FileLock, Timeout

from voxflow.domain.models import utc_now

_ALLOWED_FIELDS = {
    "artifact_id",
    "code",
    "duration_ms",
    "event",
    "exit_code",
    "interface",
    "job_id",
    "kind",
    "level",
    "phase",
    "project_id",
    "request_id",
    "revision",
    "status",
}


class EventLogger:
    """Append structured operational metadata without user text, paths, or requests."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def emit(self, event: str, *, level: str = "info", **fields: Any) -> None:
        record: dict[str, Any] = {
            "timestamp": utc_now().isoformat(),
            "event": event,
            "level": level,
            "pid": os.getpid(),
        }
        for key, value in fields.items():
            if key in _ALLOWED_FIELDS and value is not None and _safe_scalar(value):
                record[key] = value
        encoded = json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            lock = FileLock(str(self.path) + ".lock")
            with lock.acquire(timeout=10), self.path.open("a", encoding="utf-8") as output:
                output.write(encoded + "\n")
        except (OSError, Timeout):
            # Telemetry must never change the success/failure of the operation being observed.
            return


def _safe_scalar(value: Any) -> bool:
    return isinstance(value, (bool, int, float)) or (
        isinstance(value, str) and len(value) <= 200 and "\n" not in value and "\r" not in value
    )
