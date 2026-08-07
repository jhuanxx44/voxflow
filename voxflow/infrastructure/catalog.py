"""SQLite catalog for discoverability, jobs, artifacts, and idempotency."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from typing import Any

from voxflow.domain.models import Artifact, Job, JobStatus, Project, utc_now


class Catalog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA foreign_keys=ON")
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    manifest_path TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    data_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS projects_updated_at_idx
                    ON projects(updated_at DESC);

                CREATE TABLE IF NOT EXISTS artifacts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    data_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS artifacts_project_idx
                    ON artifacts(project_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    data_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS jobs_project_idx
                    ON jobs(project_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);

                CREATE TABLE IF NOT EXISTS idempotency (
                    project_id TEXT NOT NULL,
                    client_request_id TEXT NOT NULL,
                    payload_sha256 TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    PRIMARY KEY(project_id, client_request_id)
                );
                """
            )

    @staticmethod
    def _dump(model: Any) -> str:
        return json.dumps(model.model_dump(mode="json"), ensure_ascii=False, sort_keys=True)

    def upsert_project(self, project: Project, manifest_path: Path) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO projects(id, name, manifest_path, updated_at, data_json)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    manifest_path=excluded.manifest_path,
                    updated_at=excluded.updated_at,
                    data_json=excluded.data_json
                """,
                (
                    project.id,
                    project.name,
                    str(manifest_path),
                    project.updated_at.isoformat(),
                    self._dump(project),
                ),
            )

    def list_projects(self, *, limit: int, offset: int) -> tuple[list[Project], int]:
        with self.connect() as connection:
            total = int(connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0])
            rows = connection.execute(
                "SELECT data_json FROM projects ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [Project.model_validate_json(row["data_json"]) for row in rows], total

    def clear_discovery_index(self) -> None:
        """Clear only rebuildable rows; persistent jobs/idempotency remain authoritative."""
        with self.connect() as connection:
            connection.execute("DELETE FROM artifacts")
            connection.execute("DELETE FROM projects")

    def upsert_artifact(self, artifact: Artifact) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO artifacts(id, project_id, kind, path, created_at, data_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, path=excluded.path
                """,
                (
                    artifact.id,
                    artifact.project_id,
                    artifact.kind.value,
                    artifact.path,
                    artifact.created_at.isoformat(),
                    self._dump(artifact),
                ),
            )

    def get_artifact(self, artifact_id: str) -> Artifact | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT data_json FROM artifacts WHERE id = ?", (artifact_id,)
            ).fetchone()
        return Artifact.model_validate_json(row["data_json"]) if row else None

    def delete_artifact(self, artifact_id: str) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM artifacts WHERE id = ?", (artifact_id,))

    def upsert_job(self, job: Job) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO jobs(id, project_id, kind, status, created_at, updated_at, data_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status,
                    updated_at=excluded.updated_at,
                    data_json=excluded.data_json
                """,
                (
                    job.id,
                    job.project_id,
                    job.kind,
                    job.status.value,
                    job.created_at.isoformat(),
                    (job.heartbeat_at or job.created_at).isoformat(),
                    self._dump(job),
                ),
            )

    def get_job(self, job_id: str) -> Job | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT data_json FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
        return Job.model_validate_json(row["data_json"]) if row else None

    def claim_job(self, job_id: str, worker_pid: int) -> Job | None:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT data_json FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
            if not row:
                return None
            job = Job.model_validate_json(row["data_json"])
            if job.status not in {JobStatus.QUEUED, JobStatus.INTERRUPTED}:
                return None
            now = utc_now()
            job.status = JobStatus.RUNNING
            job.phase = "starting"
            job.progress = max(job.progress, 0.01)
            job.started_at = now
            job.heartbeat_at = now
            job.worker_pid = worker_pid
            job.attempt += 1
            connection.execute(
                """
                UPDATE jobs SET status = ?, updated_at = ?, data_json = ? WHERE id = ?
                """,
                (job.status.value, now.isoformat(), self._dump(job), job.id),
            )
            return job

    def request_job_cancel(self, job_id: str) -> Job | None:
        job = self.get_job(job_id)
        if not job:
            return None
        job.cancel_requested = True
        if job.status == JobStatus.QUEUED:
            job.status = JobStatus.CANCELLED
            job.finished_at = utc_now()
            job.phase = "cancelled"
        job.heartbeat_at = utc_now()
        self.upsert_job(job)
        return job

    def interrupt_stale_jobs(self, *, stale_after_seconds: int = 120) -> int:
        cutoff = utc_now() - timedelta(seconds=stale_after_seconds)
        interrupted = 0
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT data_json FROM jobs WHERE status = ?", (JobStatus.RUNNING.value,)
            ).fetchall()
            for row in rows:
                job = Job.model_validate_json(row["data_json"])
                heartbeat = job.heartbeat_at or job.started_at or job.created_at
                if heartbeat >= cutoff:
                    continue
                job.status = JobStatus.INTERRUPTED
                job.phase = "interrupted"
                job.finished_at = utc_now()
                job.error = {
                    "code": "WORKER_HEARTBEAT_LOST",
                    "message": "Worker stopped updating the job heartbeat",
                    "retryable": True,
                    "details": {"worker_pid": job.worker_pid},
                }
                connection.execute(
                    "UPDATE jobs SET status = ?, updated_at = ?, data_json = ? WHERE id = ?",
                    (
                        job.status.value,
                        job.finished_at.isoformat(),
                        self._dump(job),
                        job.id,
                    ),
                )
                interrupted += 1
        return interrupted

    def list_jobs(
        self, *, project_id: str | None, limit: int, offset: int
    ) -> tuple[list[Job], int]:
        where = " WHERE project_id = ?" if project_id else ""
        params: tuple[Any, ...] = (project_id,) if project_id else ()
        with self.connect() as connection:
            total = int(
                connection.execute(f"SELECT COUNT(*) FROM jobs{where}", params).fetchone()[0]
            )
            rows = connection.execute(
                f"SELECT data_json FROM jobs{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (*params, limit, offset),
            ).fetchall()
        return [Job.model_validate_json(row["data_json"]) for row in rows], total

    def get_idempotency(self, project_id: str, client_request_id: str) -> dict[str, str] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT payload_sha256, result_json FROM idempotency
                WHERE project_id = ? AND client_request_id = ?
                """,
                (project_id, client_request_id),
            ).fetchone()
        return dict(row) if row else None

    def put_idempotency(
        self,
        project_id: str,
        client_request_id: str,
        payload_sha256: str,
        result_json: str,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO idempotency(project_id, client_request_id, payload_sha256, result_json)
                VALUES (?, ?, ?, ?)
                """,
                (project_id, client_request_id, payload_sha256, result_json),
            )
