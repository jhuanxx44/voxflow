"""Canonical file-backed project storage with atomic revisions and process locks."""

from __future__ import annotations

import builtins
import os
import re
import shutil
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from filelock import FileLock, Timeout

from voxflow.domain.errors import (
    LockConflictError,
    NotFoundError,
    SchemaCompatibilityError,
    ValidationError,
)
from voxflow.domain.ids import new_artifact_id, new_clip_id, new_project_id
from voxflow.domain.models import (
    Artifact,
    ArtifactKind,
    Project,
    SourceMedia,
    TimelineClip,
    TimelineRevision,
    Transcript,
    TranscriptStatus,
    utc_now,
)
from voxflow.infrastructure.catalog import Catalog
from voxflow.infrastructure.files import (
    atomic_write_json,
    fsync_directory,
    managed_copy,
    read_json,
    sha256_file,
)
from voxflow.infrastructure.media import MediaProbe
from voxflow.infrastructure.schema_compat import require_current_schema
from voxflow.settings import Settings

_SAFE_ID = re.compile(r"^[a-z]+_[a-f0-9]{32}$")


class ProjectStore:
    def __init__(self, settings: Settings, catalog: Catalog | None = None) -> None:
        self.settings = settings
        self.settings.ensure()
        self.catalog = catalog or Catalog(settings.catalog_path)
        self.probe = MediaProbe(settings.ffprobe)

    def _validate_id(self, project_id: str) -> None:
        if not _SAFE_ID.fullmatch(project_id):
            raise ValidationError("Invalid project ID", details={"project_id": project_id})

    def project_dir(self, project_id: str) -> Path:
        self._validate_id(project_id)
        return self.settings.projects_dir / project_id

    def manifest_path(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "project.json"

    def transcript_path(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "transcript.json"

    def revision_path(self, project_id: str, revision: int) -> Path:
        return self.project_dir(project_id) / "revisions" / f"{revision:06d}.json"

    @contextmanager
    def lock(self, project_id: str, timeout: float = 30) -> Iterator[None]:
        directory = self.project_dir(project_id)
        directory.mkdir(parents=True, exist_ok=True)
        lock = FileLock(directory / ".project.lock")
        try:
            with lock.acquire(timeout=timeout):
                yield
        except Timeout as error:
            raise LockConflictError(
                "Timed out waiting for project lock", details={"project_id": project_id}
            ) from error

    def create(
        self,
        source_path: Path,
        *,
        name: str | None = None,
        reference_source: bool = False,
    ) -> Project:
        source = self.resolve_input_path(source_path)
        if not source.is_file():
            raise ValidationError(
                "Source path must be a regular file", details={"path": str(source)}
            )
        if source.stat().st_size > self.settings.max_input_bytes:
            raise ValidationError(
                "Source media exceeds the configured size limit",
                details={
                    "size_bytes": source.stat().st_size,
                    "max_input_bytes": self.settings.max_input_bytes,
                },
            )
        media = self.probe.inspect(source)
        if media.duration_ms > self.settings.max_media_duration_ms:
            raise ValidationError(
                "Source media exceeds the configured duration limit",
                details={
                    "duration_ms": media.duration_ms,
                    "max_media_duration_ms": self.settings.max_media_duration_ms,
                },
            )
        digest = sha256_file(source)
        project_id = new_project_id()
        artifact_id = new_artifact_id()
        project_directory = self.project_dir(project_id)
        temporary_directory = self.settings.projects_dir / f".{project_id}.tmp"
        if temporary_directory.exists():
            shutil.rmtree(temporary_directory)
        (temporary_directory / "source").mkdir(parents=True)
        (temporary_directory / "revisions").mkdir()
        (temporary_directory / "exports").mkdir()
        (temporary_directory / "replacements").mkdir()
        (temporary_directory / "artifacts").mkdir()
        (temporary_directory / "logs").mkdir()

        final_source = project_directory / "source" / source.name
        temporary_source = temporary_directory / "source" / source.name
        if reference_source:
            managed_path = source
        else:
            managed_copy(source, temporary_source)
            managed_path = final_source

        project = Project(
            id=project_id,
            name=(name or source.stem).strip() or source.stem,
            source=SourceMedia(
                artifact_id=artifact_id,
                original_name=source.name,
                managed_path=str(managed_path),
                sha256=digest,
                media=media,
                reference_source=reference_source,
            ),
        )
        revision = TimelineRevision(
            project_id=project_id,
            revision=0,
            parent_revision=None,
            reason="Project created",
            clips=[],
        )
        atomic_write_json(temporary_directory / "project.json", project.model_dump(mode="json"))
        atomic_write_json(
            temporary_directory / "revisions" / "000000.json",
            revision.model_dump(mode="json"),
        )
        os.replace(temporary_directory, project_directory)
        fsync_directory(self.settings.projects_dir)

        artifact_path = source if reference_source else final_source
        artifact = Artifact(
            id=artifact_id,
            project_id=project_id,
            kind=ArtifactKind.SOURCE,
            path=str(artifact_path),
            mime_type="video/*" if media.has_video else "audio/*",
            size_bytes=artifact_path.stat().st_size,
            sha256=digest,
            metadata={"original_name": source.name, "reference_source": reference_source},
        )
        self.catalog.upsert_project(project, self.manifest_path(project_id))
        self.register_artifact(artifact)
        return project

    def resolve_input_path(self, path: Path) -> Path:
        resolved = path.expanduser().resolve(strict=True)
        roots = self.settings.allowed_input_roots
        internally_managed = resolved.is_relative_to(self.settings.home)
        if (
            roots
            and not internally_managed
            and not any(resolved.is_relative_to(root) for root in roots)
        ):
            raise ValidationError(
                "Input path is outside the configured allowed roots",
                details={"path": str(resolved), "allowed_roots": [str(root) for root in roots]},
            )
        return resolved

    def get(self, project_id: str) -> Project:
        path = self.manifest_path(project_id)
        if not path.is_file():
            raise NotFoundError("Project not found", details={"project_id": project_id})
        try:
            payload = read_json(path)
            require_current_schema(payload, document="project")
            return Project.model_validate(payload)
        except SchemaCompatibilityError:
            raise
        except Exception as error:
            raise ValidationError(
                "Project manifest is invalid",
                details={"project_id": project_id, "error": str(error)},
            ) from error

    def list(self, *, limit: int = 20, offset: int = 0) -> tuple[list[Project], int]:
        return self.catalog.list_projects(limit=limit, offset=offset)

    def get_timeline(self, project_id: str, revision: int | None = None) -> TimelineRevision:
        project = self.get(project_id)
        selected = project.revision if revision is None else revision
        path = self.revision_path(project_id, selected)
        if not path.is_file():
            raise NotFoundError(
                "Timeline revision not found",
                details={"project_id": project_id, "revision": selected},
            )
        try:
            payload = read_json(path)
            require_current_schema(payload, document="timeline")
            return TimelineRevision.model_validate(payload)
        except SchemaCompatibilityError:
            raise
        except Exception as error:
            raise ValidationError(
                "Timeline manifest is invalid",
                details={"project_id": project_id, "revision": selected, "error": str(error)},
            ) from error

    def get_transcript(self, project_id: str) -> Transcript:
        path = self.transcript_path(project_id)
        if not path.is_file():
            raise NotFoundError("Transcript not found", details={"project_id": project_id})
        try:
            payload = read_json(path)
            require_current_schema(payload, document="transcript")
            return Transcript.model_validate(payload)
        except SchemaCompatibilityError:
            raise
        except Exception as error:
            raise ValidationError(
                "Transcript manifest is invalid",
                details={"project_id": project_id, "error": str(error)},
            ) from error

    def set_transcript_running(self, project_id: str, job_id: str, model: str) -> Project:
        with self.lock(project_id):
            project = self.get(project_id)
            project.transcript.status = TranscriptStatus.RUNNING
            project.transcript.job_id = job_id
            project.transcript.model = model
            project.transcript.error = None
            project.updated_at = utc_now()
            self._write_project(project)
            return project

    def set_transcript_failed(self, project_id: str, job_id: str, error: dict[str, object]) -> None:
        with self.lock(project_id):
            project = self.get(project_id)
            if project.transcript.job_id == job_id:
                project.transcript.status = TranscriptStatus.FAILED
                project.transcript.error = error
                project.updated_at = utc_now()
                self._write_project(project)

    def set_transcript_cancelled(self, project_id: str, job_id: str) -> None:
        with self.lock(project_id):
            project = self.get(project_id)
            if project.transcript.job_id == job_id:
                project.transcript.status = TranscriptStatus.NONE
                project.transcript.job_id = None
                project.transcript.error = None
                project.updated_at = utc_now()
                self._write_project(project)

    def save_transcript(self, transcript: Transcript, *, job_id: str | None = None) -> Project:
        project_id = transcript.project_id
        with self.lock(project_id):
            project = self.get(project_id)
            if project.revision > 0 and project.transcript.status == TranscriptStatus.READY:
                raise ValidationError("Replacing an existing transcript is not supported in v1")
            clips = [
                TimelineClip(
                    id=new_clip_id(),
                    source_segment_id=segment.id,
                    source_in_ms=segment.start_ms,
                    source_out_ms=segment.end_ms,
                    transcript_text=segment.text,
                    speaker_id=segment.speaker_id,
                    token_ids=[token.id for token in segment.tokens],
                )
                for segment in transcript.segments
            ]
            overflowing = [
                segment.id
                for segment in transcript.segments
                if segment.end_ms > project.source.media.duration_ms
            ]
            if overflowing:
                raise ValidationError(
                    "Transcript timestamps exceed source media duration",
                    details={
                        "source_duration_ms": project.source.media.duration_ms,
                        "segment_ids": overflowing[:20],
                        "truncated": len(overflowing) > 20,
                    },
                )
            if not clips:
                raise ValidationError("Transcript must contain at least one segment")
            revision = TimelineRevision(
                project_id=project_id,
                revision=1,
                parent_revision=0,
                reason="Transcript initialized",
                clips=clips,
            )
            atomic_write_json(self.transcript_path(project_id), transcript.model_dump(mode="json"))
            atomic_write_json(
                self.revision_path(project_id, revision.revision), revision.model_dump(mode="json")
            )
            project.revision = 1
            project.timeline_revision_path = "revisions/000001.json"
            project.transcript.status = TranscriptStatus.READY
            project.transcript.model = transcript.model
            project.transcript.language = transcript.language
            project.transcript.segment_count = len(transcript.segments)
            project.transcript.job_id = job_id
            project.transcript.error = None
            project.updated_at = utc_now()
            self._write_project(project)
            return project

    def commit_timeline(self, project: Project, timeline: TimelineRevision) -> None:
        if timeline.revision != project.revision + 1:
            raise ValidationError("Timeline revision must increment project revision by one")
        atomic_write_json(
            self.revision_path(project.id, timeline.revision), timeline.model_dump(mode="json")
        )
        project.revision = timeline.revision
        project.timeline_revision_path = f"revisions/{timeline.revision:06d}.json"
        project.updated_at = utc_now()
        self._write_project(project)

    def register_artifact(self, artifact: Artifact) -> None:
        if artifact.project_id != self.get(artifact.project_id).id:
            raise ValidationError("Artifact project does not exist")
        manifest = self.project_dir(artifact.project_id) / "artifacts" / f"{artifact.id}.json"
        atomic_write_json(manifest, artifact.model_dump(mode="json"))
        self.catalog.upsert_artifact(artifact)

    def rebuild_catalog(self) -> dict[str, int]:
        discovered_projects: list[tuple[Project, Path]] = []
        discovered_artifacts: list[Artifact] = []
        for directory in self.settings.projects_dir.iterdir():
            if not directory.is_dir() or not _SAFE_ID.fullmatch(directory.name):
                continue
            manifest = directory / "project.json"
            if not manifest.is_file():
                continue
            project_payload = read_json(manifest)
            require_current_schema(project_payload, document="project")
            project = Project.model_validate(project_payload)
            discovered_projects.append((project, manifest))
            artifacts_dir = directory / "artifacts"
            if artifacts_dir.is_dir():
                for artifact_manifest in artifacts_dir.glob("art_*.json"):
                    payload = read_json(artifact_manifest)
                    require_current_schema(payload, document="artifact")
                    discovered_artifacts.append(Artifact.model_validate(payload))

        self.catalog.clear_discovery_index()
        projects = 0
        artifacts = 0
        for project, manifest in discovered_projects:
            self.catalog.upsert_project(project, manifest)
            projects += 1
        for artifact in discovered_artifacts:
            self.catalog.upsert_artifact(artifact)
            artifacts += 1
        return {"projects": projects, "artifacts": artifacts}

    def history(self, project_id: str, *, limit: int = 20) -> builtins.list[TimelineRevision]:
        project = self.get(project_id)
        start = project.revision
        stop = max(-1, start - limit)
        return [self.get_timeline(project_id, revision) for revision in range(start, stop, -1)]

    def _write_project(self, project: Project) -> None:
        path = self.manifest_path(project.id)
        atomic_write_json(path, project.model_dump(mode="json"))
        self.catalog.upsert_project(project, path)
