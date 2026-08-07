"""Content-addressed cache for JSON-compatible ASR provider responses."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from voxflow.infrastructure.files import atomic_write_json, read_json


class ASRCache:
    """Cache raw provider payloads by immutable source content and recognition config."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def key(source_sha256: str, config: dict[str, Any]) -> str:
        encoded = json.dumps(
            {"source_sha256": source_sha256, "config": config},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(encoded).hexdigest()

    def get(self, cache_key: str) -> Any | None:
        path = self._path(cache_key)
        if not path.is_file():
            return None
        try:
            envelope = read_json(path)
        except (OSError, ValueError, json.JSONDecodeError):
            # A corrupt cache entry is disposable and must never block recognition.
            path.unlink(missing_ok=True)
            return None
        if envelope.get("schema_version") != 1 or envelope.get("cache_key") != cache_key:
            path.unlink(missing_ok=True)
            return None
        return envelope.get("payload")

    def put(
        self,
        cache_key: str,
        *,
        source_sha256: str,
        config: dict[str, Any],
        payload: Any,
    ) -> None:
        atomic_write_json(
            self._path(cache_key),
            {
                "schema_version": 1,
                "cache_key": cache_key,
                "source_sha256": source_sha256,
                "config": config,
                "payload": _json_compatible(payload),
            },
        )

    def _path(self, cache_key: str) -> Path:
        if len(cache_key) != 64 or any(
            character not in "0123456789abcdef" for character in cache_key
        ):
            raise ValueError("ASR cache key must be a lowercase SHA-256 digest")
        return self.directory / f"{cache_key}.json"


def _json_compatible(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(key): _json_compatible(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_compatible(item) for item in value]
    if hasattr(value, "tolist"):
        return _json_compatible(value.tolist())
    if hasattr(value, "item"):
        return _json_compatible(value.item())
    raise TypeError(f"ASR payload contains a non-JSON value: {type(value).__name__}")
