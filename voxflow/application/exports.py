"""Export job submission and artifact discovery."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from voxflow.application.jobs import JobService
from voxflow.domain.errors import NotFoundError, ValidationError
from voxflow.infrastructure.catalog import Catalog
from voxflow.infrastructure.project_store import ProjectStore


class ExportService:
    FORMATS = {"mp4", "mp3", "wav", "srt", "vtt"}

    def __init__(self, store: ProjectStore, jobs: JobService, catalog: Catalog) -> None:
        self.store = store
        self.jobs = jobs
        self.catalog = catalog

    def start(
        self,
        project_id: str,
        *,
        output_format: str,
        out: Path | None = None,
        run_inline: bool | None = None,
    ) -> dict[str, Any]:
        if output_format not in self.FORMATS:
            raise ValidationError(
                "Unsupported export format",
                details={"format": output_format, "supported": sorted(self.FORMATS)},
            )
        project = self.store.get(project_id)
        timeline = self.store.get_timeline(project_id)
        if not timeline.clips:
            raise ValidationError(
                "Project timeline is empty; transcribe or import a transcript first"
            )
        if output_format == "mp4" and not project.source.media.has_video:
            raise ValidationError("MP4 export requires a video source")
        if output_format in {"mp3", "wav"} and not project.source.media.has_audio:
            raise ValidationError(f"{output_format.upper()} export requires an audio stream")
        invalid_ranges = [
            clip.id
            for clip in timeline.clips
            if clip.source_in_ms < 0
            or clip.source_out_ms > project.source.media.duration_ms
            or clip.source_out_ms <= clip.source_in_ms
        ]
        if invalid_ranges:
            raise ValidationError(
                "Timeline contains ranges outside the source media",
                details={"clip_ids": invalid_ranges[:20], "truncated": len(invalid_ranges) > 20},
            )
        destination = out.expanduser().resolve() if out else None
        if destination and destination == Path(project.source.managed_path).resolve():
            raise ValidationError("Export cannot overwrite the source media")
        if destination and destination.exists() and destination.is_dir():
            raise ValidationError("Export --out must be a file path, not a directory")
        job = self.jobs.submit(
            "export",
            project_id,
            {
                "format": output_format,
                "revision": timeline.revision,
                "out": str(destination) if destination else None,
            },
            run_inline=run_inline,
        )
        return job.model_dump(mode="json")

    def artifact(self, artifact_id: str) -> dict[str, Any]:
        artifact = self.catalog.get_artifact(artifact_id)
        if not artifact:
            raise NotFoundError("Artifact not found", details={"artifact_id": artifact_id})
        exists = Path(artifact.path).is_file()
        data = artifact.model_dump(mode="json")
        data["exists"] = exists
        return data
