"""Safe project migration and mark-and-sweep maintenance services."""

from __future__ import annotations

import shutil
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from voxflow.domain.errors import NotFoundError, ValidationError
from voxflow.domain.models import (
    Artifact,
    ArtifactKind,
    Project,
    TimelineRevision,
    Transcript,
    utc_now,
)
from voxflow.infrastructure.files import atomic_write_json, read_json
from voxflow.infrastructure.project_store import ProjectStore
from voxflow.infrastructure.schema_compat import CURRENT_SCHEMA_VERSION, schema_version

Validator = type[BaseModel]


class MigrationService:
    """Upgrade legacy v0 manifests to v1 after a complete dry validation pass."""

    def __init__(self, store: ProjectStore) -> None:
        self.store = store

    def migrate(self, project_id: str, *, dry_run: bool) -> dict[str, Any]:
        directory = self.store.project_dir(project_id)
        if not directory.is_dir():
            raise NotFoundError("Project not found", details={"project_id": project_id})
        documents = self._documents(directory)
        if not documents or documents[0][0].name != "project.json":
            raise ValidationError("Project manifest is missing", details={"project_id": project_id})

        changes: list[tuple[Path, dict[str, Any], dict[str, Any]]] = []
        report: list[dict[str, Any]] = []
        for path, model, document in documents:
            payload = read_json(path)
            found = schema_version(payload, document=document)
            migrated = dict(payload)
            if found < CURRENT_SCHEMA_VERSION:
                migrated["schema_version"] = CURRENT_SCHEMA_VERSION
                changes.append((path, payload, migrated))
            model.model_validate(migrated)
            report.append(
                {
                    "document": path.relative_to(directory).as_posix(),
                    "from_version": found,
                    "to_version": CURRENT_SCHEMA_VERSION,
                    "change": "set schema_version=1" if found == 0 else "none",
                }
            )

        backup: str | None = None
        if changes and not dry_run:
            stamp = utc_now().strftime("%Y%m%dT%H%M%S%fZ")
            backup_dir = directory / "backups" / f"migration-{stamp}"
            with self.store.lock(project_id):
                # Re-read under the lock so a concurrent writer cannot invalidate the plan.
                for path, original, _migrated in changes:
                    if read_json(path) != original:
                        raise ValidationError(
                            "Project changed while migration was being prepared",
                            details={"project_id": project_id},
                        )
                for path, _original, migrated in changes:
                    relative = path.relative_to(directory)
                    destination = backup_dir / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(path, destination)
                    atomic_write_json(path, migrated)
            self.store.rebuild_catalog()
            backup = backup_dir.relative_to(directory).as_posix()

        return {
            "project_id": project_id,
            "dry_run": dry_run,
            "current_schema_version": CURRENT_SCHEMA_VERSION,
            "migration_required": bool(changes),
            "changed_documents": len(changes) if not dry_run else 0,
            "backup": backup,
            "documents": report,
        }

    @staticmethod
    def _documents(directory: Path) -> list[tuple[Path, Validator, str]]:
        documents: list[tuple[Path, Validator, str]] = []
        project = directory / "project.json"
        if project.is_file():
            documents.append((project, Project, "project"))
        transcript = directory / "transcript.json"
        if transcript.is_file():
            documents.append((transcript, Transcript, "transcript"))
        documents.extend(
            (path, TimelineRevision, "timeline")
            for path in sorted((directory / "revisions").glob("*.json"))
        )
        documents.extend(
            (path, Artifact, "artifact")
            for path in sorted((directory / "artifacts").glob("art_*.json"))
        )
        return documents


class CleanupService:
    """Delete only expired disposable files after marking all revision references."""

    def __init__(self, store: ProjectStore, *, clock: Callable[[], datetime] = utc_now) -> None:
        self.store = store
        self.clock = clock

    def run(self, *, dry_run: bool) -> dict[str, Any]:
        now = self.clock()
        candidate_cutoff = now - timedelta(seconds=self.store.settings.candidate_ttl_seconds)
        cache_cutoff = now - timedelta(seconds=self.store.settings.cache_ttl_seconds)
        temporary_cutoff = now - timedelta(seconds=self.store.settings.temporary_ttl_seconds)
        actions: list[dict[str, Any]] = []

        for directory in sorted(self.store.settings.projects_dir.glob("prj_*")):
            if not directory.is_dir():
                continue
            project_id = directory.name
            # Validation also rejects path-shaped directory names.
            self.store.project_dir(project_id)
            referenced = self._referenced_replacements(directory)
            known_candidates: set[str] = set()
            for manifest in sorted((directory / "artifacts").glob("art_*.json")):
                payload = read_json(manifest)
                artifact = Artifact.model_validate(payload)
                if artifact.kind != ArtifactKind.REPLACEMENT_AUDIO:
                    continue
                known_candidates.add(artifact.id)
                if artifact.id in referenced or artifact.created_at >= candidate_cutoff:
                    continue
                data = Path(artifact.path)
                if not self._is_managed_file(data, directory / "replacements"):
                    raise ValidationError(
                        "Refusing to clean replacement artifact outside its managed directory",
                        details={"artifact_id": artifact.id},
                    )
                actions.append(self._action("replacement_candidate", data, manifest, artifact.id))

            replacements = directory / "replacements"
            for path in sorted(replacements.glob("art_*.wav")):
                artifact_id = path.stem
                if artifact_id in known_candidates or artifact_id in referenced:
                    continue
                if self._modified_before(path, candidate_cutoff):
                    actions.append(self._action("orphan_replacement", path, None, artifact_id))

            for pattern, kind in (
                ("exports/*.partial.*", "partial_export"),
                ("replacements/*.partial.*", "partial_replacement"),
                ("logs/*-reference.wav", "temporary_reference"),
            ):
                for path in sorted(directory.glob(pattern)):
                    if self._modified_before(path, temporary_cutoff):
                        actions.append(self._action(kind, path, None, None))

        for cache_dir, kind in (
            (self.store.settings.asr_cache_dir, "asr_cache"),
            (self.store.settings.tts_cache_dir, "tts_cache"),
            (self.store.settings.web_uploads_dir, "web_upload"),
        ):
            for path in sorted(cache_dir.iterdir()):
                if path.is_file() and self._modified_before(path, cache_cutoff):
                    actions.append(self._action(kind, path, None, None))

        unique = _deduplicate_actions(actions)
        reclaimed = sum(int(action["size_bytes"]) for action in unique)
        if not dry_run:
            for action in unique:
                data = self.store.settings.home / str(action["path"])
                data.unlink(missing_ok=True)
                manifest_path = action.get("manifest")
                if manifest_path:
                    (self.store.settings.home / str(manifest_path)).unlink(missing_ok=True)
                deleting_artifact_id = action.get("artifact_id")
                if deleting_artifact_id:
                    self.store.catalog.delete_artifact(str(deleting_artifact_id))

        by_kind: dict[str, int] = {}
        for action in unique:
            kind = str(action["kind"])
            by_kind[kind] = by_kind.get(kind, 0) + 1
        return {
            "dry_run": dry_run,
            "deleted": 0 if dry_run else len(unique),
            "reclaimed_bytes": 0 if dry_run else reclaimed,
            "would_delete": len(unique) if dry_run else 0,
            "would_reclaim_bytes": reclaimed if dry_run else 0,
            "by_kind": by_kind,
            "items": unique,
        }

    def _referenced_replacements(self, directory: Path) -> set[str]:
        referenced: set[str] = set()
        for path in sorted((directory / "revisions").glob("*.json")):
            timeline = TimelineRevision.model_validate(read_json(path))
            referenced.update(
                clip.replacement_artifact_id
                for clip in timeline.clips
                if clip.replacement_artifact_id is not None
            )
        return referenced

    def _is_managed_file(self, path: Path, directory: Path) -> bool:
        resolved = path.resolve()
        return (
            path.is_file()
            and not path.is_symlink()
            and resolved.is_relative_to(directory.resolve())
        )

    @staticmethod
    def _modified_before(path: Path, cutoff: datetime) -> bool:
        modified = datetime.fromtimestamp(path.stat().st_mtime, tz=cutoff.tzinfo)
        return modified < cutoff

    def _action(
        self,
        kind: str,
        path: Path,
        manifest: Path | None,
        artifact_id: str | None,
    ) -> dict[str, Any]:
        resolved = path.resolve()
        if not resolved.is_relative_to(self.store.settings.home.resolve()):
            raise ValidationError("Refusing to clean a path outside VOXFLOW_HOME")
        return {
            "kind": kind,
            "path": path.relative_to(self.store.settings.home).as_posix(),
            "manifest": (
                manifest.relative_to(self.store.settings.home).as_posix() if manifest else None
            ),
            "artifact_id": artifact_id,
            "size_bytes": path.stat().st_size if path.is_file() else 0,
        }


def _deduplicate_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for action in actions:
        unique.setdefault(str(action["path"]), action)
    return list(unique.values())
