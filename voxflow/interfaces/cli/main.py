"""Composable `voxflow` CLI for humans, Codex, and automation."""

from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Annotated, Any, Literal, TypeAlias, cast

import typer

from voxflow.application.doctor import doctor as run_doctor
from voxflow.application.runtime import Runtime
from voxflow.domain.errors import DependencyError
from voxflow.domain.operations import EditPlan
from voxflow.infrastructure.files import read_json
from voxflow.interfaces.cli.output import Output
from voxflow.settings import Settings

DurationPolicy: TypeAlias = Literal["natural", "fit_source", "pad_or_trim"]

app = typer.Typer(
    name="voxflow",
    help="Deterministic headless audio/video editing for agents and scripts.",
    no_args_is_help=True,
)
project_app = typer.Typer(help="Create, discover, and inspect media projects.")
transcript_app = typer.Typer(help="Recognize, import, read, and search transcripts.")
timeline_app = typer.Typer(help="Read the current ordered edit timeline.")
edit_app = typer.Typer(help="Preview and atomically apply structured Edit Plans.")
job_app = typer.Typer(help="Inspect and control long-running recognition/export jobs.")
export_app = typer.Typer(help="Render edited media and subtitles into artifacts.")
artifact_app = typer.Typer(help="Inspect exported or managed artifacts.")
speech_app = typer.Typer(help="Generate and attach persistent speech replacement candidates.")
raw_app = typer.Typer(help="Read canonical manifests when high-level commands are insufficient.")
mcp_app = typer.Typer(help="Run the VoxFlow MCP server.")

for name, group in (
    ("project", project_app),
    ("transcript", transcript_app),
    ("timeline", timeline_app),
    ("edit", edit_app),
    ("job", job_app),
    ("export", export_app),
    ("artifact", artifact_app),
    ("speech", speech_app),
    ("raw", raw_app),
    ("mcp", mcp_app),
):
    app.add_typer(group, name=name)


@dataclass
class CLIContext:
    settings: Settings
    output: Output
    _runtime: Runtime | None = field(default=None, init=False)

    @property
    def runtime(self) -> Runtime:
        if self._runtime is None:
            self._runtime = Runtime.create(self.settings)
        return self._runtime


def _context(ctx: typer.Context) -> CLIContext:
    return ctx.ensure_object(CLIContext)


@app.callback()
def callback(
    ctx: typer.Context,
    json_output: Annotated[
        bool, typer.Option("--json", help="Emit a stable one-line JSON envelope on stdout.")
    ] = False,
    home: Annotated[
        Path | None,
        typer.Option("--home", help="Override VOXFLOW_HOME for this invocation."),
    ] = None,
) -> None:
    settings = Settings.from_env()
    if home is not None:
        settings = replace(settings, home=home.expanduser().resolve())
    ctx.obj = CLIContext(settings=settings, output=Output(json_output))


@app.command()
def doctor(ctx: typer.Context) -> None:
    """Check Python, FFmpeg, storage, MCP, and optional ASR readiness."""
    state = _context(ctx)
    state.output.run(lambda: run_doctor(state.settings))


@project_app.command("create")
def project_create(
    ctx: typer.Context,
    source: Annotated[Path, typer.Argument(help="Local audio or video path.")],
    name: Annotated[str | None, typer.Option("--name")] = None,
    reference_source: Annotated[
        bool,
        typer.Option("--reference-source", help="Reference instead of managed-copying source."),
    ] = False,
) -> None:
    state = _context(ctx)
    state.output.run(
        lambda: state.runtime.projects.create(source, name=name, reference_source=reference_source)
    )


@project_app.command("list")
def project_list(
    ctx: typer.Context,
    limit: Annotated[int, typer.Option(min=1, max=200)] = 20,
    offset: Annotated[int, typer.Option(min=0)] = 0,
) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.projects.list(limit=limit, offset=offset))


@project_app.command("get")
def project_get(ctx: typer.Context, project_id: str) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.projects.get(project_id))


@project_app.command("rebuild-index")
def project_rebuild_index(ctx: typer.Context) -> None:
    """Rebuild project and artifact catalog rows from canonical manifests."""
    state = _context(ctx)
    state.output.run(state.runtime.projects.rebuild_index)


@transcript_app.command("start")
def transcript_start(
    ctx: typer.Context,
    project_id: str,
    model: Annotated[str, typer.Option(help="basic or advanced")] = "advanced",
    hotwords: Annotated[str, typer.Option(help="Space-separated recognition hotwords.")] = "",
    wait: Annotated[bool, typer.Option("--wait")] = False,
    timeout: Annotated[float, typer.Option(min=1)] = 1800,
) -> None:
    state = _context(ctx)

    def action() -> Any:
        state.runtime.store.get(project_id)
        job = state.runtime.jobs.submit(
            "transcribe", project_id, {"model": model, "hotwords": hotwords}
        )
        if wait:
            state.output.progress(f"Waiting for recognition job {job.id}...")
            job = state.runtime.jobs.wait(job.id, timeout=timeout)
        return job

    state.output.run(action)


@transcript_app.command("import")
def transcript_import(
    ctx: typer.Context,
    project_id: str,
    input_file: Annotated[Path, typer.Option("--file", exists=True, dir_okay=False)],
    model: Annotated[str, typer.Option()] = "imported",
    language: Annotated[str | None, typer.Option()] = "zh",
) -> None:
    state = _context(ctx)

    def action() -> Any:
        return state.runtime.transcripts.import_file(
            project_id, input_file, model=model, language=language
        )

    state.output.run(action)


@transcript_app.command("get")
def transcript_get(
    ctx: typer.Context,
    project_id: str,
    offset: Annotated[int, typer.Option(min=0)] = 0,
    limit: Annotated[int, typer.Option(min=1, max=200)] = 50,
) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.transcripts.get(project_id, offset=offset, limit=limit))


@transcript_app.command("search")
def transcript_search(
    ctx: typer.Context,
    project_id: str,
    query: str,
    context: Annotated[int, typer.Option(min=0, max=10)] = 2,
    limit: Annotated[int, typer.Option(min=1, max=100)] = 20,
) -> None:
    state = _context(ctx)
    state.output.run(
        lambda: state.runtime.transcripts.search(project_id, query, context=context, limit=limit)
    )


@timeline_app.command("get")
def timeline_get(
    ctx: typer.Context,
    project_id: str,
    offset: Annotated[int, typer.Option(min=0)] = 0,
    limit: Annotated[int, typer.Option(min=1, max=200)] = 50,
) -> None:
    state = _context(ctx)
    state.output.run(
        lambda: state.runtime.transcripts.timeline(project_id, offset=offset, limit=limit)
    )


def _load_plan(path: Path, state: CLIContext) -> EditPlan:
    resolved = state.runtime.store.resolve_input_path(path)
    return EditPlan.model_validate(read_json(resolved))


@edit_app.command("preview")
def edit_preview(
    ctx: typer.Context,
    project_id: str,
    plan: Annotated[Path, typer.Option("--plan", exists=True, dir_okay=False)],
) -> None:
    state = _context(ctx)

    def action() -> Any:
        loaded = _load_plan(plan, state)
        if loaded.project_id != project_id:
            raise ValueError("Edit Plan project_id does not match command project_id")
        preview = state.runtime.edits.preview(loaded)
        return {"project_id": project_id, "diff": preview.diff.model_dump(mode="json")}

    state.output.run(action)


@edit_app.command("apply")
def edit_apply(
    ctx: typer.Context,
    project_id: str,
    plan: Annotated[Path, typer.Option("--plan", exists=True, dir_okay=False)],
) -> None:
    state = _context(ctx)

    def action() -> Any:
        loaded = _load_plan(plan, state)
        if loaded.project_id != project_id:
            raise ValueError("Edit Plan project_id does not match command project_id")
        return state.runtime.edits.apply(loaded)

    state.output.run(action)


@edit_app.command("history")
def edit_history(
    ctx: typer.Context,
    project_id: str,
    limit: Annotated[int, typer.Option(min=1, max=200)] = 20,
) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.edits.history(project_id, limit=limit))


@edit_app.command("undo")
def edit_undo(
    ctx: typer.Context,
    project_id: str,
    expected_revision: Annotated[int, typer.Option("--expected-revision", min=1)],
    to_revision: Annotated[int, typer.Option("--to-revision", min=1)],
    client_request_id: Annotated[str, typer.Option("--client-request-id")],
    apply_change: Annotated[
        bool, typer.Option("--apply", help="Commit the restore; otherwise preview only.")
    ] = False,
) -> None:
    state = _context(ctx)
    if apply_change:
        state.output.run(
            lambda: state.runtime.edits.undo_apply(
                project_id,
                expected_revision=expected_revision,
                to_revision=to_revision,
                client_request_id=client_request_id,
            )
        )
    else:
        state.output.run(
            lambda: {
                "project_id": project_id,
                "diff": state.runtime.edits.undo_preview(
                    project_id,
                    expected_revision=expected_revision,
                    to_revision=to_revision,
                ).diff.model_dump(mode="json"),
            }
        )


@speech_app.command("replace-start")
def speech_replace_start(
    ctx: typer.Context,
    project_id: str,
    clip_id: str,
    expected_revision: Annotated[int, typer.Option("--expected-revision", min=1)],
    text: Annotated[str | None, typer.Option("--text")] = None,
    text_file: Annotated[
        Path | None, typer.Option("--text-file", exists=True, dir_okay=False)
    ] = None,
    duration_policy: Annotated[
        str | None, typer.Option("--duration-policy", help="natural, fit_source, or pad_or_trim")
    ] = None,
    wait: Annotated[bool, typer.Option("--wait")] = False,
    timeout: Annotated[float, typer.Option(min=1)] = 300,
) -> None:
    """Generate a candidate artifact; attach it later through an Edit Plan."""
    state = _context(ctx)

    def action() -> Any:
        if (text is None) == (text_file is None):
            raise ValueError("Provide exactly one of --text or --text-file")
        if text is not None:
            replacement_text = text
        elif text_file is not None:
            replacement_text = text_file.read_text(encoding="utf-8")
        else:  # Guarded above; retained to keep static narrowing explicit.
            raise ValueError("Provide exactly one of --text or --text-file")
        if duration_policy not in {None, "natural", "fit_source", "pad_or_trim"}:
            raise ValueError("Invalid --duration-policy")
        submitted = state.runtime.speech.start(
            project_id,
            expected_revision=expected_revision,
            clip_id=clip_id,
            text=replacement_text,
            duration_policy=cast(DurationPolicy | None, duration_policy),
        )
        if wait:
            state.output.progress(f"Waiting for speech replacement job {submitted['id']}...")
            return state.runtime.jobs.wait(submitted["id"], timeout=timeout)
        return submitted

    state.output.run(action)


@job_app.command("get")
def job_get(ctx: typer.Context, job_id: str) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.jobs.get(job_id))


@job_app.command("list")
def job_list(
    ctx: typer.Context,
    project_id: Annotated[str | None, typer.Option("--project")] = None,
    limit: Annotated[int, typer.Option(min=1, max=200)] = 20,
    offset: Annotated[int, typer.Option(min=0)] = 0,
) -> None:
    state = _context(ctx)
    state.output.run(
        lambda: state.runtime.jobs.list(project_id=project_id, limit=limit, offset=offset)
    )


@job_app.command("wait")
def job_wait(
    ctx: typer.Context,
    job_id: str,
    timeout: Annotated[float, typer.Option(min=1)] = 1800,
) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.jobs.wait(job_id, timeout=timeout))


@job_app.command("cancel")
def job_cancel(ctx: typer.Context, job_id: str) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.jobs.cancel(job_id))


@job_app.command("retry")
def job_retry(ctx: typer.Context, job_id: str) -> None:
    """Create a new attempt from a failed, cancelled, or interrupted job."""
    state = _context(ctx)
    state.output.run(lambda: state.runtime.jobs.retry(job_id))


@export_app.command("create")
def export_create(
    ctx: typer.Context,
    project_id: str,
    output_format: Annotated[str, typer.Option("--format")] = "mp4",
    out: Annotated[Path | None, typer.Option("--out")] = None,
    wait: Annotated[bool, typer.Option("--wait")] = False,
    timeout: Annotated[float, typer.Option(min=1)] = 3600,
) -> None:
    state = _context(ctx)

    def action() -> Any:
        submitted = state.runtime.exports.start(project_id, output_format=output_format, out=out)
        if wait:
            state.output.progress(f"Waiting for export job {submitted['id']}...")
            return state.runtime.jobs.wait(submitted["id"], timeout=timeout)
        return submitted

    state.output.run(action)


@artifact_app.command("get")
def artifact_get(ctx: typer.Context, artifact_id: str) -> None:
    state = _context(ctx)
    state.output.run(lambda: state.runtime.exports.artifact(artifact_id))


@raw_app.command("read")
def raw_read(
    ctx: typer.Context,
    project_id: str,
    revision: Annotated[int | None, typer.Option("--revision", min=0)] = None,
) -> None:
    """Read a canonical project or timeline revision manifest without bypassing validation."""
    state = _context(ctx)
    if revision is None:
        state.output.run(lambda: state.runtime.store.get(project_id))
    else:
        state.output.run(lambda: state.runtime.store.get_timeline(project_id, revision))


@mcp_app.command("serve")
def mcp_serve(ctx: typer.Context) -> None:
    """Run the local stdio MCP server; stdout is reserved for MCP transport."""
    state = _context(ctx)
    os.environ["VOXFLOW_HOME"] = str(state.settings.home)
    try:
        from voxflow.interfaces.mcp.server import run
    except ImportError as error:
        state.output.error(
            DependencyError("MCP support is not installed; install VoxFlow with the mcp extra")
        )
        raise typer.Exit(5) from error
    run()


if __name__ == "__main__":
    app()
