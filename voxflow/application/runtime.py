"""Composition root for all VoxFlow interfaces and workers."""

from __future__ import annotations

from dataclasses import dataclass

from voxflow.application.edits import EditService
from voxflow.application.exports import ExportService
from voxflow.application.jobs import JobService
from voxflow.application.projects import ProjectService
from voxflow.application.transcripts import TranscriptService
from voxflow.infrastructure.catalog import Catalog
from voxflow.infrastructure.project_store import ProjectStore
from voxflow.settings import Settings


@dataclass
class Runtime:
    settings: Settings
    catalog: Catalog
    store: ProjectStore
    projects: ProjectService
    transcripts: TranscriptService
    edits: EditService
    jobs: JobService
    exports: ExportService

    @classmethod
    def create(cls, settings: Settings | None = None) -> Runtime:
        selected = settings or Settings.from_env()
        selected.ensure()
        catalog = Catalog(selected.catalog_path)
        catalog.interrupt_stale_jobs()
        store = ProjectStore(selected, catalog)
        jobs = JobService(selected, catalog)
        return cls(
            settings=selected,
            catalog=catalog,
            store=store,
            projects=ProjectService(store),
            transcripts=TranscriptService(store),
            edits=EditService(store),
            jobs=jobs,
            exports=ExportService(store, jobs, catalog),
        )
