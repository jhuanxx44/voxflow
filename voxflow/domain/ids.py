"""Stable, typed identifiers for persisted VoxFlow objects."""

from __future__ import annotations

import uuid


def new_id(prefix: str) -> str:
    """Return a collision-resistant stable ID with a human-readable type prefix."""
    return f"{prefix}_{uuid.uuid4().hex}"


def derived_id(prefix: str, *parts: object) -> str:
    """Return a deterministic typed UUID for objects derived by a pure reducer."""
    name = "\x1f".join(str(part) for part in parts)
    return f"{prefix}_{uuid.uuid5(uuid.NAMESPACE_URL, name).hex}"


def new_project_id() -> str:
    return new_id("prj")


def new_segment_id() -> str:
    return new_id("seg")


def new_token_id() -> str:
    return new_id("tok")


def new_clip_id() -> str:
    return new_id("clip")


def new_artifact_id() -> str:
    return new_id("art")


def new_job_id() -> str:
    return new_id("job")


def new_request_id() -> str:
    return new_id("req")
