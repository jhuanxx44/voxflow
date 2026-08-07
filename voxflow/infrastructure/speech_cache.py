"""Content-addressed cache for synthesized replacement WAV files."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from voxflow.infrastructure.files import atomic_write_json, read_json, sha256_file


class SpeechCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def key(config: dict[str, Any]) -> str:
        encoded = json.dumps(
            config, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
        return hashlib.sha256(encoded).hexdigest()

    def get(self, cache_key: str) -> Path | None:
        audio, manifest = self._paths(cache_key)
        if not audio.is_file() or not manifest.is_file():
            return None
        try:
            metadata = read_json(manifest)
            if (
                metadata.get("schema_version") != 1
                or metadata.get("cache_key") != cache_key
                or metadata.get("sha256") != sha256_file(audio)
            ):
                raise ValueError("invalid speech cache manifest")
        except (OSError, ValueError, json.JSONDecodeError):
            audio.unlink(missing_ok=True)
            manifest.unlink(missing_ok=True)
            return None
        return audio

    def put(self, cache_key: str, source: Path, *, config: dict[str, Any]) -> Path:
        audio, manifest = self._paths(cache_key)
        temporary = audio.with_suffix(".partial.wav")
        shutil.copy2(source, temporary)
        temporary.replace(audio)
        atomic_write_json(
            manifest,
            {
                "schema_version": 1,
                "cache_key": cache_key,
                "sha256": sha256_file(audio),
                "config": config,
            },
        )
        return audio

    def _paths(self, cache_key: str) -> tuple[Path, Path]:
        if len(cache_key) != 64 or any(c not in "0123456789abcdef" for c in cache_key):
            raise ValueError("Speech cache key must be a lowercase SHA-256 digest")
        return self.directory / f"{cache_key}.wav", self.directory / f"{cache_key}.json"
