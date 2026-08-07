from datetime import timedelta

from voxflow.application.jobs import JobService
from voxflow.domain.errors import JobCancelledError
from voxflow.domain.models import Job, JobStatus, utc_now
from voxflow.infrastructure.catalog import Catalog
from voxflow.settings import Settings


def test_stale_running_job_is_marked_interrupted(settings: Settings) -> None:
    catalog = Catalog(settings.catalog_path)
    job = Job(id="job_test", kind="export", project_id="prj_test", request={})
    job.status = JobStatus.RUNNING
    job.started_at = utc_now() - timedelta(minutes=5)
    job.heartbeat_at = job.started_at
    catalog.upsert_job(job)
    assert catalog.interrupt_stale_jobs(stale_after_seconds=60) == 1
    interrupted = catalog.get_job(job.id)
    assert interrupted and interrupted.status == JobStatus.INTERRUPTED
    assert interrupted.error and interrupted.error["retryable"] is True


def test_queued_job_cancellation_is_persistent(settings: Settings) -> None:
    catalog = Catalog(settings.catalog_path)
    job = Job(id="job_cancel", kind="export", project_id="prj_test", request={})
    catalog.upsert_job(job)
    cancelled = JobService(settings, catalog).cancel(job.id)
    assert cancelled.status == JobStatus.CANCELLED
    assert cancelled.cancel_requested is True
    assert Catalog(settings.catalog_path).get_job(job.id).status == JobStatus.CANCELLED


def test_running_handler_cancellation_is_not_recorded_as_failure(settings: Settings) -> None:
    catalog = Catalog(settings.catalog_path)
    service = JobService(settings, catalog)
    job = Job(id="job_running_cancel", kind="export", project_id="prj_test", request={})
    catalog.upsert_job(job)
    claimed = catalog.claim_job(job.id, worker_pid=123)
    assert claimed is not None

    def cancelled_handler(_job: Job, _service: JobService) -> dict[str, object]:
        raise JobCancelledError("cancelled by test")

    completed = service.run_claimed(claimed, cancelled_handler)
    assert completed.status == JobStatus.CANCELLED
    assert completed.error is None
