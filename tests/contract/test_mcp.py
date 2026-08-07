from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

pytest.importorskip("mcp")

from voxflow.interfaces.mcp.server import mcp, transcript_import


def test_mcp_exposes_bounded_high_level_tools() -> None:
    tools = asyncio.run(mcp.list_tools())
    names = {tool.name for tool in tools}
    assert {
        "doctor",
        "project_create",
        "transcript_start",
        "transcript_import",
        "transcript_get",
        "transcript_search",
        "timeline_get",
        "edit_preview",
        "edit_apply",
        "speech_replace_start",
        "export_start",
        "job_get",
        "artifact_get",
    } <= names
    snapshot = {
        tool.name: {
            "properties": sorted(tool.inputSchema.get("properties", {})),
            "required": sorted(tool.inputSchema.get("required", [])),
        }
        for tool in sorted(tools, key=lambda item: item.name)
    }
    golden = json.loads(
        (Path(__file__).with_name("golden") / "mcp-tool-contract.json").read_text(encoding="utf-8")
    )
    assert snapshot == golden

    by_name = {tool.name: tool for tool in tools}
    transcript_limit = by_name["transcript_get"].inputSchema["properties"]["limit"]
    assert transcript_limit["minimum"] == 1
    assert transcript_limit["maximum"] == 200
    assert by_name["export_start"].inputSchema["properties"]["output_format"]["enum"] == [
        "mp4",
        "mp3",
        "wav",
        "srt",
        "vtt",
    ]
    speech_schema = by_name["speech_replace_start"].inputSchema
    assert sorted(speech_schema["required"]) == [
        "clip_id",
        "expected_revision",
        "project_id",
        "text",
    ]
    policy_schema = speech_schema["properties"]["duration_policy"]["anyOf"][0]
    assert policy_schema["enum"] == ["natural", "fit_source", "pad_or_trim"]
    edit_schema = by_name["edit_preview"].inputSchema["$defs"]["EditPlan"]
    assert edit_schema["properties"]["operations"]["minItems"] == 1
    assert "discriminator" in edit_schema["properties"]["operations"]["items"]
    output = by_name["edit_apply"].outputSchema
    assert set(output["$defs"]) >= {"MCPSuccessEnvelope", "MCPErrorEnvelope"}


def test_mcp_exposes_discovery_resources() -> None:
    resources = asyncio.run(mcp.list_resources())
    uris = {str(resource.uri) for resource in resources}
    assert "voxflow://projects" in uris
    templates = asyncio.run(mcp.list_resource_templates())
    template_uris = {template.uriTemplate for template in templates}
    assert template_uris == {
        "voxflow://jobs/{job_id}",
        "voxflow://projects/{project_id}/summary",
        "voxflow://projects/{project_id}/timeline/summary",
    }


def test_mcp_maps_local_file_errors_to_structured_envelope() -> None:
    result = transcript_import(
        "prj_00000000000000000000000000000000",
        "/definitely/missing/voxflow-transcript.json",
    )
    payload = result.model_dump(mode="json")
    assert payload["ok"] is False
    assert payload["error"]["code"] == "VALIDATION_ERROR"
    assert payload["error"]["retryable"] is False
