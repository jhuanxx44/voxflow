"""Project discovery and media ingest use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from voxflow.domain.errors import ValidationError
from voxflow.infrastructure.project_store import ProjectStore


class ProjectService:
    def __init__(self, store: ProjectStore) -> None:
        self.store = store

    def create(
        self, source: Path, *, name: str | None = None, reference_source: bool = False
    ) -> dict[str, Any]:
        project = self.store.create(source, name=name, reference_source=reference_source)
        return project.model_dump(mode="json")

    def get(self, project_id: str) -> dict[str, Any]:
        project = self.store.get(project_id)
        data = project.model_dump(mode="json")
        data["timeline_duration_ms"] = self.store.get_timeline(project_id).duration_ms
        return data

    def list(self, *, limit: int = 20, offset: int = 0) -> dict[str, Any]:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValidationError("Project pagination requires 1 <= limit <= 200 and offset >= 0")
        projects, total = self.store.list(limit=limit, offset=offset)
        return {
            "items": [project.model_dump(mode="json") for project in projects],
            "total": total,
            "limit": limit,
            "offset": offset,
            "next_offset": offset + limit if offset + limit < total else None,
            "next_cursor": offset + limit if offset + limit < total else None,
        }

    def rebuild_index(self) -> dict[str, int]:
        """Rebuild disposable project/artifact catalog rows from canonical manifests."""
        return self.store.rebuild_catalog()
