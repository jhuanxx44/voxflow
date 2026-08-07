"""stdio MCP adapter exposing bounded VoxFlow application services."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Annotated, Any, Literal, TypeAlias

from mcp.server.fastmcp import FastMCP
from pydantic import Field
from pydantic import ValidationError as PydanticValidationError

from voxflow.application.doctor import doctor as run_doctor
from voxflow.application.runtime import Runtime
from voxflow.domain.errors import InternalError, ValidationError, VoxFlowError
from voxflow.domain.ids import new_request_id
from voxflow.domain.models import StrictModel
from voxflow.domain.operations import EditPlan

PageLimit: TypeAlias = Annotated[int, Field(ge=1, le=200)]
SearchLimit: TypeAlias = Annotated[int, Field(ge=1, le=100)]
Offset: TypeAlias = Annotated[int, Field(ge=0)]
ContextSize: TypeAlias = Annotated[int, Field(ge=0, le=10)]
Revision: TypeAlias = Annotated[int, Field(ge=0)]
ASRModel: TypeAlias = Literal["basic", "advanced"]
ExportFormat: TypeAlias = Literal["mp4", "mp3", "wav", "srt", "vtt"]


class MCPSuccessEnvelope(StrictModel):
    ok: Literal[True] = True
    data: Any
    meta: dict[str, Any]


class MCPErrorData(StrictModel):
    code: str
    message: str
    retryable: bool
    details: dict[str, Any]


class MCPErrorEnvelope(StrictModel):
    ok: Literal[False] = False
    error: MCPErrorData
    meta: dict[str, Any]


MCPEnvelope: TypeAlias = MCPSuccessEnvelope | MCPErrorEnvelope

mcp = FastMCP(
    "VoxFlow",
    instructions=(
        "Deterministic local audio/video editing. Start with doctor, create a project, "
        "start recognition, page/search the transcript, preview an Edit Plan, then apply it. "
        "Long recognition/export operations return job IDs and must be polled with job_get."
    ),
)


def _runtime() -> Runtime:
    return Runtime.create()


def _envelope(
    action: Callable[[], Any], *, recommended_next_tool: str | None = None
) -> MCPEnvelope:
    request_id = new_request_id()
    try:
        value = action()
        if hasattr(value, "model_dump"):
            value = value.model_dump(mode="json")
        meta: dict[str, Any] = {"request_id": request_id, "schema_version": 1}
        if recommended_next_tool:
            meta["recommended_next_tool"] = recommended_next_tool
        return MCPSuccessEnvelope(data=value, meta=meta)
    except VoxFlowError as error:
        return MCPErrorEnvelope(
            error=MCPErrorData.model_validate(error.as_dict()),
            meta={"request_id": request_id, "schema_version": 1},
        )
    except PydanticValidationError as error:
        converted = ValidationError(
            "Input does not match the required schema",
            details={"errors": error.errors(include_url=False, include_input=False)},
        )
        return MCPErrorEnvelope(
            error=MCPErrorData.model_validate(converted.as_dict()),
            meta={"request_id": request_id, "schema_version": 1},
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        converted = ValidationError(str(error))
        return MCPErrorEnvelope(
            error=MCPErrorData.model_validate(converted.as_dict()),
            meta={"request_id": request_id, "schema_version": 1},
        )
    except Exception as error:  # adapter boundary: never leak an unstructured tool failure
        internal_error = InternalError(
            "Unexpected internal error", details={"error_type": type(error).__name__}
        )
        return MCPErrorEnvelope(
            error=MCPErrorData.model_validate(internal_error.as_dict()),
            meta={"request_id": request_id, "schema_version": 1},
        )


@mcp.tool()
def doctor() -> MCPEnvelope:
    """Check local storage, FFmpeg, MCP, and optional FunASR readiness."""
    runtime = _runtime()
    return _envelope(lambda: run_doctor(runtime.settings))


@mcp.tool()
def project_create(
    source_path: str, name: str | None = None, reference_source: bool = False
) -> MCPEnvelope:
    """Create a managed project from one local audio/video file."""
    return _envelope(
        lambda: _runtime().projects.create(
            Path(source_path), name=name, reference_source=reference_source
        ),
        recommended_next_tool="transcript_start",
    )


@mcp.tool()
def project_list(limit: PageLimit = 20, offset: Offset = 0) -> MCPEnvelope:
    """List local projects with bounded pagination."""
    return _envelope(lambda: _runtime().projects.list(limit=limit, offset=offset))


@mcp.tool()
def project_get(project_id: str) -> MCPEnvelope:
    """Read a project summary, source metadata, and current revision."""
    return _envelope(lambda: _runtime().projects.get(project_id))


@mcp.tool()
def transcript_start(
    project_id: str, model: ASRModel = "advanced", hotwords: str = ""
) -> MCPEnvelope:
    """Start local ASR and return a job ID immediately."""

    def action() -> Any:
        runtime = _runtime()
        runtime.store.get(project_id)
        return runtime.jobs.submit("transcribe", project_id, {"model": model, "hotwords": hotwords})

    return _envelope(action, recommended_next_tool="job_get")


@mcp.tool()
def transcript_import(
    project_id: str,
    input_path: str,
    model: str = "imported",
    language: str | None = "zh",
) -> MCPEnvelope:
    """Import a local FunASR-compatible JSON result for offline/migration workflows."""

    def action() -> Any:
        return _runtime().transcripts.import_file(
            project_id, Path(input_path), model=model, language=language
        )

    return _envelope(action, recommended_next_tool="timeline_get")


@mcp.tool()
def transcript_get(project_id: str, offset: Offset = 0, limit: PageLimit = 50) -> MCPEnvelope:
    """Read a bounded page of stable transcript segment/token IDs."""
    return _envelope(lambda: _runtime().transcripts.get(project_id, offset=offset, limit=limit))


@mcp.tool()
def transcript_search(
    project_id: str, query: str, context: ContextSize = 2, limit: SearchLimit = 20
) -> MCPEnvelope:
    """Search transcript text and return stable IDs plus surrounding context."""
    return _envelope(
        lambda: _runtime().transcripts.search(project_id, query, context=context, limit=limit)
    )


@mcp.tool()
def timeline_get(project_id: str, offset: Offset = 0, limit: PageLimit = 50) -> MCPEnvelope:
    """Read the current ordered edit timeline and revision."""
    return _envelope(
        lambda: _runtime().transcripts.timeline(project_id, offset=offset, limit=limit)
    )


@mcp.tool()
def edit_preview(plan: EditPlan) -> MCPEnvelope:
    """Validate an Edit Plan without writing; returns exact duration/clip diff."""

    def action() -> Any:
        preview = _runtime().edits.preview(plan)
        return {"project_id": preview.project_id, "diff": preview.diff.model_dump(mode="json")}

    return _envelope(action, recommended_next_tool="edit_apply")


@mcp.tool()
def edit_apply(plan: EditPlan) -> MCPEnvelope:
    """Atomically commit a previously previewed Edit Plan using expected_revision."""
    return _envelope(
        lambda: _runtime().edits.apply(plan),
        recommended_next_tool="export_start",
    )


@mcp.tool()
def edit_history(project_id: str, limit: PageLimit = 20) -> MCPEnvelope:
    """List recent immutable timeline revisions."""
    return _envelope(lambda: _runtime().edits.history(project_id, limit=limit))


@mcp.tool()
def edit_undo_preview(
    project_id: str, expected_revision: Revision, to_revision: Revision
) -> MCPEnvelope:
    """Preview restoring an older revision as a new revision."""
    return _envelope(
        lambda: {
            "project_id": project_id,
            "diff": _runtime()
            .edits.undo_preview(
                project_id,
                expected_revision=expected_revision,
                to_revision=to_revision,
            )
            .diff.model_dump(mode="json"),
        }
    )


@mcp.tool()
def edit_undo_apply(
    project_id: str,
    expected_revision: Revision,
    to_revision: Revision,
    client_request_id: str,
) -> MCPEnvelope:
    """Commit restoration of an older revision as a new immutable revision."""
    return _envelope(
        lambda: _runtime().edits.undo_apply(
            project_id,
            expected_revision=expected_revision,
            to_revision=to_revision,
            client_request_id=client_request_id,
        )
    )


@mcp.tool()
def export_start(project_id: str, output_format: ExportFormat = "mp4") -> MCPEnvelope:
    """Start MP4/MP3/WAV/SRT/VTT rendering and return a job ID."""
    return _envelope(
        lambda: _runtime().exports.start(project_id, output_format=output_format),
        recommended_next_tool="job_get",
    )


@mcp.tool()
def job_get(job_id: str) -> MCPEnvelope:
    """Poll recognition/export status, progress, result artifact, or structured error."""
    return _envelope(lambda: _runtime().jobs.get(job_id))


@mcp.tool()
def job_cancel(job_id: str) -> MCPEnvelope:
    """Request cancellation of a queued or running job."""
    return _envelope(lambda: _runtime().jobs.cancel(job_id))


@mcp.tool()
def job_retry(job_id: str) -> MCPEnvelope:
    """Create a new attempt from a failed, cancelled, or interrupted job."""
    return _envelope(lambda: _runtime().jobs.retry(job_id))


@mcp.tool()
def artifact_get(artifact_id: str) -> MCPEnvelope:
    """Read artifact metadata and its local path; never returns media bytes."""
    return _envelope(lambda: _runtime().exports.artifact(artifact_id))


@mcp.resource("voxflow://projects")
def projects_resource() -> str:
    """Compact JSON project discovery resource."""
    return project_list(limit=20).model_dump_json()


@mcp.resource("voxflow://projects/{project_id}/summary")
def project_summary_resource(project_id: str) -> str:
    """Compact JSON summary for one project."""
    return project_get(project_id).model_dump_json()


@mcp.resource("voxflow://projects/{project_id}/timeline/summary")
def timeline_summary_resource(project_id: str) -> str:
    """Compact first-page timeline summary with current revision and pagination cursor."""
    return timeline_get(project_id, limit=20).model_dump_json()


@mcp.resource("voxflow://jobs/{job_id}")
def job_resource(job_id: str) -> str:
    """Compact JSON status for one long-running job."""
    return job_get(job_id).model_dump_json()


def run() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    run()
