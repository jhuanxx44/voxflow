"""Persistent local job submission, polling, cancellation, and worker execution."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal, cast

from voxflow.domain.errors import (
    JobCancelledError,
    JobFailedError,
    NotFoundError,
    ValidationError,
    VoxFlowError,
)
from voxflow.domain.ids import new_job_id
from voxflow.domain.models import Job, JobStatus, utc_now
from voxflow.infrastructure.catalog import Catalog
from voxflow.infrastructure.telemetry import EventLogger
from voxflow.settings import Settings

JobHandler = Callable[[Job, "JobService"], dict[str, Any]]


class JobService:
    def __init__(self, settings: Settings, catalog: Catalog) -> None:
        self.settings = settings
        self.catalog = catalog
        self.events = EventLogger(settings.events_log_path)

    def submit(
        self,
        kind: str,
        project_id: str,
        request: dict[str, Any],
        *,
        run_inline: bool | None = None,
    ) -> Job:
        if kind not in {"transcribe", "export", "speech_replace"}:
            raise ValidationError("Unsupported job kind", details={"kind": kind})
        if kind == "transcribe":
            model = request.get("model", "advanced")
            if model not in {"basic", "advanced"}:
                raise ValidationError(
                    "Unsupported ASR model",
                    details={"model": model, "supported": ["basic", "advanced"]},
                )
            if len(str(request.get("hotwords", ""))) > 20_000:
                raise ValidationError("ASR hotwords exceed the 20000 character limit")
        if kind == "speech_replace" and not str(request.get("text", "")).strip():
            raise ValidationError("Speech replacement text cannot be empty")
        job_id = new_job_id()
        log_path = self.settings.jobs_dir / f"{job_id}.log"
        job = Job(
            id=job_id,
            kind=cast(Literal["transcribe", "export", "speech_replace"], kind),
            project_id=project_id,
            request=request,
            log_path=str(log_path),
        )
        self.catalog.upsert_job(job)
        self.events.emit(
            "job_submitted",
            job_id=job.id,
            project_id=project_id,
            kind=kind,
            phase=job.phase,
            status=job.status.value,
        )
        inline = self.settings.job_inline if run_inline is None else run_inline
        if inline:
            from voxflow.worker import execute_job

            execute_job(job.id, settings=self.settings)
        else:
            environment = os.environ.copy()
            environment.update(self.settings.worker_environment())
            with log_path.open("ab") as log:
                subprocess.Popen(
                    [sys.executable, "-m", "voxflow.worker", job.id],
                    stdin=subprocess.DEVNULL,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    env=environment,
                    start_new_session=True,
                    close_fds=True,
                )
        return self.get(job_id)

    def get(self, job_id: str) -> Job:
        job = self.catalog.get_job(job_id)
        if not job:
            raise NotFoundError("Job not found", details={"job_id": job_id})
        return job

    def list(
        self, *, project_id: str | None = None, limit: int = 20, offset: int = 0
    ) -> dict[str, Any]:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValidationError("Job pagination requires 1 <= limit <= 200 and offset >= 0")
        jobs, total = self.catalog.list_jobs(project_id=project_id, limit=limit, offset=offset)
        return {
            "items": [job.model_dump(mode="json") for job in jobs],
            "total": total,
            "limit": limit,
            "offset": offset,
            "next_offset": offset + limit if offset + limit < total else None,
            "next_cursor": offset + limit if offset + limit < total else None,
        }

    def cancel(self, job_id: str) -> Job:
        job = self.catalog.request_job_cancel(job_id)
        if not job:
            raise NotFoundError("Job not found", details={"job_id": job_id})
        return job

    def retry(self, job_id: str, *, run_inline: bool | None = None) -> Job:
        previous = self.get(job_id)
        if previous.status not in {
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.INTERRUPTED,
        }:
            raise ValidationError(
                "Only failed, cancelled, or interrupted jobs can be retried",
                details={"job_id": job_id, "status": previous.status.value},
            )
        request = dict(previous.request)
        request["retry_of"] = previous.id
        return self.submit(
            previous.kind,
            previous.project_id,
            request,
            run_inline=run_inline,
        )

    def wait(self, job_id: str, *, timeout: float = 1800, interval: float = 0.25) -> Job:
        deadline = time.monotonic() + timeout
        while True:
            job = self.get(job_id)
            if job.status == JobStatus.SUCCEEDED:
                return job
            if job.status in {
                JobStatus.FAILED,
                JobStatus.CANCELLED,
                JobStatus.INTERRUPTED,
            }:
                raise JobFailedError(
                    f"Job ended with status {job.status.value}",
                    details={"job_id": job.id, "status": job.status.value, "error": job.error},
                )
            if time.monotonic() >= deadline:
                raise JobFailedError(
                    "Timed out waiting for job",
                    details={"job_id": job_id, "timeout": timeout},
                )
            time.sleep(interval)

    def update(
        self,
        job: Job,
        *,
        phase: str | None = None,
        progress: float | None = None,
    ) -> Job:
        if phase is not None:
            job.phase = phase
        if progress is not None:
            job.progress = progress
        job.heartbeat_at = utc_now()
        self.catalog.upsert_job(job)
        return job

    def run_claimed(self, job: Job, handler: JobHandler) -> Job:
        started = time.monotonic()
        self.events.emit(
            "job_started",
            job_id=job.id,
            project_id=job.project_id,
            kind=job.kind,
            phase=job.phase,
            status=job.status.value,
        )
        try:
            if job.cancel_requested:
                job.status = JobStatus.CANCELLED
                job.phase = "cancelled"
            else:
                result = handler(job, self)
                refreshed = self.get(job.id)
                job.cancel_requested = refreshed.cancel_requested
                if job.cancel_requested:
                    job.status = JobStatus.CANCELLED
                    job.phase = "cancelled"
                else:
                    job.result = result
                    job.progress = 1.0
                    job.phase = "completed"
                    job.status = JobStatus.SUCCEEDED
        except JobCancelledError:
            job.status = JobStatus.CANCELLED
            job.phase = "cancelled"
            job.cancel_requested = True
            job.error = None
        except VoxFlowError as error:
            job.status = JobStatus.FAILED
            job.phase = "failed"
            job.error = error.as_dict()
        except Exception as error:  # worker boundary: persist unexpected failures
            job.status = JobStatus.FAILED
            job.phase = "failed"
            job.error = {
                "code": "INTERNAL_ERROR",
                "message": str(error),
                "retryable": False,
                "details": {},
            }
        job.finished_at = utc_now()
        job.heartbeat_at = job.finished_at
        self.catalog.upsert_job(job)
        self.events.emit(
            "job_finished",
            level="error" if job.status == JobStatus.FAILED else "info",
            job_id=job.id,
            project_id=job.project_id,
            kind=job.kind,
            phase=job.phase,
            status=job.status.value,
            code=job.error.get("code") if job.error else None,
            duration_ms=round((time.monotonic() - started) * 1000),
        )
        return job


def job_log_tail(job: Job, max_bytes: int = 8000) -> str:
    if not job.log_path:
        return ""
    path = Path(job.log_path)
    if not path.is_file():
        return ""
    with path.open("rb") as handle:
        handle.seek(max(0, path.stat().st_size - max_bytes))
        return handle.read().decode("utf-8", errors="replace")
