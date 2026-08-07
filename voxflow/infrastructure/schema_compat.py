"""Explicit persisted-schema compatibility checks shared by reads and migration."""

from __future__ import annotations

from typing import Any

from voxflow.domain.errors import SchemaCompatibilityError, ValidationError

CURRENT_SCHEMA_VERSION = 1


def schema_version(payload: dict[str, Any], *, document: str) -> int:
    raw = payload.get("schema_version", 0)
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0:
        raise ValidationError(
            "Persisted schema_version must be a non-negative integer",
            details={"document": document, "schema_version": raw},
        )
    if raw > CURRENT_SCHEMA_VERSION:
        raise SchemaCompatibilityError(
            "Persisted document uses a newer unsupported schema version",
            details={
                "document": document,
                "found": raw,
                "supported": CURRENT_SCHEMA_VERSION,
                "action": "Upgrade VoxFlow before opening this project",
            },
        )
    return raw


def require_current_schema(payload: dict[str, Any], *, document: str) -> None:
    found = schema_version(payload, document=document)
    if found != CURRENT_SCHEMA_VERSION:
        raise SchemaCompatibilityError(
            "Persisted document requires migration before it can be opened",
            details={
                "document": document,
                "found": found,
                "supported": CURRENT_SCHEMA_VERSION,
                "action": "Run `voxflow project migrate <project-id>`",
            },
        )
