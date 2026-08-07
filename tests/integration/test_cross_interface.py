from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import anyio
import pytest

pytest.importorskip("flask")
pytest.importorskip("mcp")
pytest.importorskip("openai")
pytest.importorskip("google.genai")

from mcp import ClientSession, StdioServerParameters  # noqa: E402
from mcp.client.stdio import stdio_client  # noqa: E402

from app import app  # noqa: E402
from voxflow.application.runtime import Runtime  # noqa: E402
from voxflow.settings import Settings  # noqa: E402


def _mcp_envelope(result: Any) -> dict[str, Any]:
    if result.structuredContent:
        structured = result.structuredContent
        if "result" in structured and isinstance(structured["result"], dict):
            return structured["result"]
        return structured
    for content in result.content:
        if hasattr(content, "text"):
            return json.loads(content.text)
    raise AssertionError("MCP result did not contain a JSON envelope")


async def _mcp_edit(home: Path, project_id: str, clip_id: str) -> dict[str, Any]:
    environment = os.environ.copy()
    environment["VOXFLOW_HOME"] = str(home)
    environment["VOXFLOW_JOB_INLINE"] = "1"
    parameters = StdioServerParameters(
        command=sys.executable,
        args=["-m", "voxflow.interfaces.cli.main", "mcp", "serve"],
        env=environment,
    )
    async with stdio_client(parameters) as streams, ClientSession(*streams) as session:
        await session.initialize()
        timeline = _mcp_envelope(
            await session.call_tool("timeline_get", {"project_id": project_id})
        )
        assert timeline["data"]["revision"] == 2
        return _mcp_envelope(
            await session.call_tool(
                "edit_apply",
                {
                    "plan": {
                        "schema_version": 1,
                        "project_id": project_id,
                        "expected_revision": 2,
                        "client_request_id": "cross-interface-mcp",
                        "reason": "MCP follows Web",
                        "operations": [
                            {
                                "op": "correct_transcript",
                                "clip_id": clip_id,
                                "text": "MCP committed text",
                            }
                        ],
                    }
                },
            )
        )


def test_cli_web_and_mcp_share_project_and_conflict(settings: Settings, wav_file: Path) -> None:
    cli = subprocess.run(
        [
            sys.executable,
            "-m",
            "voxflow.interfaces.cli.main",
            "--json",
            "--home",
            str(settings.home),
            "project",
            "create",
            str(wav_file),
            "--name",
            "Cross interface",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    project_id = json.loads(cli.stdout)["data"]["id"]

    runtime = Runtime.create(settings)
    app.config.update(TESTING=True, VOXFLOW_RUNTIME=runtime)
    client = app.test_client()
    imported = client.post(
        f"/api/v1/projects/{project_id}/transcripts/import",
        json={
            "payload": {
                "text": "first second",
                "segments": [
                    {"start": 0, "end": 1000, "text": "first", "spk": 0},
                    {"start": 1000, "end": 2000, "text": "second", "spk": 1},
                ],
            }
        },
    )
    assert imported.status_code == 201
    timeline = client.get(f"/api/v1/projects/{project_id}/timeline?limit=200").get_json()["data"]
    clip_id = timeline["items"][0]["id"]

    web_plan = {
        "schema_version": 1,
        "project_id": project_id,
        "expected_revision": 1,
        "client_request_id": "cross-interface-web",
        "reason": "Web follows CLI",
        "operations": [{"op": "rename_speaker", "speaker_id": "spk_0", "name": "Host"}],
    }
    web_applied = client.post(f"/api/v1/projects/{project_id}/edits", json=web_plan)
    assert web_applied.status_code == 201
    assert web_applied.get_json()["data"]["revision"] == 2

    mcp_applied = anyio.run(_mcp_edit, settings.home, project_id, clip_id)
    assert mcp_applied["ok"] is True
    assert mcp_applied["data"]["revision"] == 3

    stale_web = dict(web_plan)
    stale_web["client_request_id"] = "cross-interface-stale-web"
    stale_web["operations"] = [{"op": "delete_clips", "clip_ids": [clip_id]}]
    conflict = client.post(f"/api/v1/projects/{project_id}/edits", json=stale_web)
    assert conflict.status_code == 409
    assert conflict.get_json()["error"]["code"] == "REVISION_CONFLICT"
    latest = client.get(f"/api/v1/projects/{project_id}/timeline?limit=200").get_json()["data"]
    assert latest["revision"] == 3
    assert latest["items"][0]["transcript_text"] == "MCP committed text"
