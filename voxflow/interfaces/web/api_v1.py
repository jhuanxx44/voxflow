"""Versioned HTTP adapter for the shared VoxFlow application services."""

from __future__ import annotations

import mimetypes
import threading
import time
from copy import deepcopy
from pathlib import Path
from typing import Any, Literal, TypeAlias, cast
from uuid import uuid4

from flask import Blueprint, Response, current_app, g, jsonify, request, send_file
from pydantic import ValidationError as PydanticValidationError
from werkzeug.utils import secure_filename

from config import MATERIALS_DIR
from voxflow.application.runtime import Runtime
from voxflow.domain.errors import (
    DependencyError,
    IdempotencyConflictError,
    LockConflictError,
    NotFoundError,
    RevisionConflictError,
    ValidationError,
    VoxFlowError,
)
from voxflow.domain.ids import new_request_id
from voxflow.domain.models import ArtifactKind
from voxflow.domain.operations import EditPlan

api_v1_bp = Blueprint("api_v1", __name__, url_prefix="/api/v1")

DurationPolicy: TypeAlias = Literal["natural", "fit_source", "pad_or_trim"]

_runtime_instance: Runtime | None = None
_runtime_lock = threading.Lock()


def _runtime() -> Runtime:
    injected = current_app.config.get("VOXFLOW_RUNTIME")
    if injected is not None:
        return injected
    global _runtime_instance
    if _runtime_instance is None:
        with _runtime_lock:
            if _runtime_instance is None:
                _runtime_instance = Runtime.create()
    return _runtime_instance


def _data(value: Any, status: int = 200) -> tuple[Response, int]:
    return jsonify(
        {
            "data": value,
            "meta": {"request_id": _request_id(), "schema_version": 1},
        }
    ), status


def _request_id() -> str:
    value = getattr(g, "voxflow_request_id", None)
    if not isinstance(value, str):
        value = new_request_id()
        g.voxflow_request_id = value
    return value


@api_v1_bp.before_request
def begin_request() -> None:
    g.voxflow_request_id = new_request_id()
    g.voxflow_started = time.monotonic()


@api_v1_bp.after_request
def finish_request(response: Response) -> Response:
    request_id = _request_id()
    response.headers["X-Request-ID"] = request_id
    started = getattr(g, "voxflow_started", time.monotonic())
    _runtime().jobs.events.emit(
        "interface_request_completed",
        level="error" if response.status_code >= 400 else "info",
        interface="web",
        request_id=request_id,
        status="failed" if response.status_code >= 400 else "succeeded",
        exit_code=response.status_code,
        duration_ms=round((time.monotonic() - started) * 1000),
    )
    return response


def _web_project(value: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(value)
    project_id = str(result["id"])
    source = result.get("source")
    if isinstance(source, dict):
        source.pop("managed_path", None)
    result["source_url"] = f"/api/v1/projects/{project_id}/source"
    return result


def _web_job(value: Any) -> dict[str, Any]:
    result = value.model_dump(mode="json") if hasattr(value, "model_dump") else deepcopy(value)
    result.pop("log_path", None)
    job_request = result.get("request")
    if isinstance(job_request, dict):
        job_request.pop("out", None)
    job_result = result.get("result")
    if isinstance(job_result, dict):
        job_result.pop("path", None)
        artifact_id = job_result.get("artifact_id")
        if artifact_id:
            job_result["download_url"] = f"/api/v1/artifacts/{artifact_id}/content"
    return result


def _web_artifact(value: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(value)
    artifact_id = str(result["id"])
    result.pop("path", None)
    result["download_url"] = f"/api/v1/artifacts/{artifact_id}/content"
    return result


def _error_status(error: VoxFlowError) -> int:
    if isinstance(error, NotFoundError):
        return 404
    if isinstance(error, (RevisionConflictError, LockConflictError, IdempotencyConflictError)):
        return 409
    if isinstance(error, DependencyError):
        return 503
    if isinstance(error, ValidationError):
        return 400
    return 500


@api_v1_bp.errorhandler(VoxFlowError)
def handle_voxflow_error(error: VoxFlowError) -> tuple[Response, int]:
    return jsonify(
        {
            "error": error.as_dict(),
            "meta": {"request_id": _request_id(), "schema_version": 1},
        }
    ), _error_status(error)


@api_v1_bp.errorhandler(PydanticValidationError)
def handle_schema_error(error: PydanticValidationError) -> tuple[Response, int]:
    payload = ValidationError(
        "Request does not match the v1 schema", details={"errors": error.errors()}
    )
    return jsonify(
        {
            "error": payload.as_dict(),
            "meta": {"request_id": _request_id(), "schema_version": 1},
        }
    ), 400


def _json_body() -> dict[str, Any]:
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValidationError("Request body must be a JSON object")
    return value


@api_v1_bp.get("/capabilities")
def capabilities() -> tuple[Response, int]:
    return _data(
        {
            "api_version": "v1",
            "project_schema_version": 1,
            "edit_plan_schema_version": 1,
            "export_formats": sorted(_runtime().exports.FORMATS),
            "speech_duration_policies": ["natural", "fit_source", "pad_or_trim"],
            "legacy_routes": ["/asr", "/export-media", "/tts"],
        }
    )


@api_v1_bp.post("/projects")
def create_project() -> tuple[Response, int]:
    runtime = _runtime()
    name = request.form.get("name") or None
    material_name = request.form.get("material_name", "").strip()
    uploaded = request.files.get("media") or request.files.get("audio")
    if bool(material_name) == bool(uploaded):
        raise ValidationError("Provide exactly one media upload or material_name")

    if material_name:
        material_root = Path(MATERIALS_DIR).resolve()
        source = (material_root / material_name).resolve()
        if not source.is_relative_to(material_root):
            raise ValidationError("Material path escapes the configured material library")
        created = runtime.projects.create(source, name=name or source.stem)
    else:
        assert uploaded is not None
        original = secure_filename(uploaded.filename or "")
        if not original:
            raise ValidationError("Uploaded media must have a filename")
        suffix = Path(original).suffix.lower()
        temporary = runtime.settings.web_uploads_dir / f"{uuid4().hex}{suffix}"
        try:
            uploaded.save(temporary)
            created = runtime.projects.create(temporary, name=name or Path(original).stem)
        finally:
            temporary.unlink(missing_ok=True)

    return _data(_web_project(created), 201)


@api_v1_bp.get("/projects")
def list_projects() -> tuple[Response, int]:
    page = _runtime().projects.list(
        limit=request.args.get("limit", default=20, type=int),
        offset=request.args.get("offset", default=0, type=int),
    )
    page["items"] = [_web_project(item) for item in page["items"]]
    return _data(page)


@api_v1_bp.get("/projects/<project_id>")
def get_project(project_id: str) -> tuple[Response, int]:
    value = _runtime().projects.get(project_id)
    response, status = _data(_web_project(value))
    response.headers["ETag"] = f'"revision-{value["revision"]}"'
    return response, status


@api_v1_bp.get("/projects/<project_id>/source")
def project_source(project_id: str) -> Response:
    project = _runtime().store.get(project_id)
    path = Path(project.source.managed_path)
    if not path.is_file():
        raise NotFoundError("Project source media is missing", details={"project_id": project_id})
    guessed, _ = mimetypes.guess_type(project.source.original_name)
    return send_file(
        path, mimetype=guessed, conditional=True, download_name=project.source.original_name
    )


@api_v1_bp.post("/projects/<project_id>/transcriptions")
def start_transcription(project_id: str) -> tuple[Response, int]:
    body = _json_body()
    runtime = _runtime()
    runtime.store.get(project_id)
    job = runtime.jobs.submit(
        "transcribe",
        project_id,
        {"model": body.get("model", "advanced"), "hotwords": body.get("hotwords", "")},
    )
    return _data(_web_job(job), 202)


@api_v1_bp.post("/projects/<project_id>/transcripts/import")
def import_transcript(project_id: str) -> tuple[Response, int]:
    body = _json_body()
    if "payload" not in body:
        raise ValidationError("Transcript import requires payload")
    return _data(
        _runtime().transcripts.import_payload(
            project_id,
            body["payload"],
            model=str(body.get("model", "imported")),
            language=body.get("language", "zh"),
        ),
        201,
    )


@api_v1_bp.get("/projects/<project_id>/transcript")
def get_transcript(project_id: str) -> tuple[Response, int]:
    return _data(
        _runtime().transcripts.get(
            project_id,
            offset=request.args.get("offset", default=0, type=int),
            limit=request.args.get("limit", default=50, type=int),
        )
    )


@api_v1_bp.get("/projects/<project_id>/transcript/search")
def search_transcript(project_id: str) -> tuple[Response, int]:
    return _data(
        _runtime().transcripts.search(
            project_id,
            request.args.get("q", ""),
            context=request.args.get("context", default=2, type=int),
            limit=request.args.get("limit", default=20, type=int),
        )
    )


@api_v1_bp.get("/projects/<project_id>/timeline")
def get_timeline(project_id: str) -> tuple[Response, int]:
    value = _runtime().transcripts.timeline(
        project_id,
        offset=request.args.get("offset", default=0, type=int),
        limit=request.args.get("limit", default=50, type=int),
    )
    response, status = _data(value)
    response.headers["ETag"] = f'"revision-{value["revision"]}"'
    return response, status


@api_v1_bp.post("/projects/<project_id>/edits/preview")
def preview_edit(project_id: str) -> tuple[Response, int]:
    plan = EditPlan.model_validate(_json_body())
    if plan.project_id != project_id:
        raise ValidationError("Edit Plan project_id does not match URL")
    preview = _runtime().edits.preview(plan)
    return _data(preview.model_dump(mode="json"))


@api_v1_bp.post("/projects/<project_id>/edits")
def apply_edit(project_id: str) -> tuple[Response, int]:
    plan = EditPlan.model_validate(_json_body())
    if plan.project_id != project_id:
        raise ValidationError("Edit Plan project_id does not match URL")
    return _data(_runtime().edits.apply(plan), 201)


@api_v1_bp.get("/projects/<project_id>/history")
def edit_history(project_id: str) -> tuple[Response, int]:
    return _data(
        _runtime().edits.history(project_id, limit=request.args.get("limit", default=20, type=int))
    )


@api_v1_bp.post("/projects/<project_id>/restore")
def restore_revision(project_id: str) -> tuple[Response, int]:
    body = _json_body()
    try:
        expected_revision = int(body["expected_revision"])
        to_revision = int(body["to_revision"])
        client_request_id = str(body["client_request_id"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValidationError(
            "Restore requires expected_revision, to_revision, and client_request_id"
        ) from error
    if body.get("dry_run", False):
        preview = _runtime().edits.undo_preview(
            project_id, expected_revision=expected_revision, to_revision=to_revision
        )
        return _data(preview.model_dump(mode="json"))
    return _data(
        _runtime().edits.undo_apply(
            project_id,
            expected_revision=expected_revision,
            to_revision=to_revision,
            client_request_id=client_request_id,
        ),
        201,
    )


@api_v1_bp.post("/projects/<project_id>/exports")
def start_export(project_id: str) -> tuple[Response, int]:
    body = _json_body()
    job = _runtime().exports.start(project_id, output_format=str(body.get("format", "mp4")))
    return _data(_web_job(job), 202)


@api_v1_bp.post("/projects/<project_id>/speech-replacements")
def start_speech_replacement(project_id: str) -> tuple[Response, int]:
    body = _json_body()
    try:
        expected_revision = int(body["expected_revision"])
        clip_id = str(body["clip_id"])
        text = str(body["text"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValidationError(
            "Speech replacement requires expected_revision, clip_id, and text"
        ) from error
    policy = body.get("duration_policy")
    if policy not in {None, "natural", "fit_source", "pad_or_trim"}:
        raise ValidationError("Invalid speech replacement duration_policy")
    job = _runtime().speech.start(
        project_id,
        expected_revision=expected_revision,
        clip_id=clip_id,
        text=text,
        duration_policy=cast(DurationPolicy | None, policy),
        parameters=body.get("parameters") if isinstance(body.get("parameters"), dict) else None,
    )
    return _data(_web_job(job), 202)


@api_v1_bp.get("/jobs")
def list_jobs() -> tuple[Response, int]:
    page = _runtime().jobs.list(
        project_id=request.args.get("project_id"),
        limit=request.args.get("limit", default=20, type=int),
        offset=request.args.get("offset", default=0, type=int),
    )
    page["items"] = [_web_job(item) for item in page["items"]]
    return _data(page)


@api_v1_bp.get("/jobs/<job_id>")
def get_job(job_id: str) -> tuple[Response, int]:
    return _data(_web_job(_runtime().jobs.get(job_id)))


@api_v1_bp.post("/jobs/<job_id>/cancel")
def cancel_job(job_id: str) -> tuple[Response, int]:
    return _data(_web_job(_runtime().jobs.cancel(job_id)))


@api_v1_bp.post("/jobs/<job_id>/retry")
def retry_job(job_id: str) -> tuple[Response, int]:
    return _data(_web_job(_runtime().jobs.retry(job_id)), 202)


@api_v1_bp.get("/artifacts/<artifact_id>")
def get_artifact(artifact_id: str) -> tuple[Response, int]:
    return _data(_web_artifact(_runtime().exports.artifact(artifact_id)))


@api_v1_bp.get("/artifacts/<artifact_id>/content")
def artifact_content(artifact_id: str) -> Response:
    runtime = _runtime()
    artifact = runtime.catalog.get_artifact(artifact_id)
    if artifact is None:
        raise NotFoundError("Artifact not found", details={"artifact_id": artifact_id})
    path = Path(artifact.path)
    if not path.is_file():
        raise NotFoundError("Artifact file is missing", details={"artifact_id": artifact_id})
    filename = str(artifact.metadata.get("filename") or path.name)
    return send_file(
        path,
        mimetype=artifact.mime_type,
        as_attachment=artifact.kind != ArtifactKind.REPLACEMENT_AUDIO,
        conditional=True,
        download_name=filename,
    )
