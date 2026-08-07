"""Real stdio MCP client smoke test for the complete offline editing workflow."""

from __future__ import annotations

import json
import math
import os
import struct
import tempfile
import wave
from pathlib import Path
from typing import Any

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def write_audio(path: Path) -> None:
    sample_rate = 16_000
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        frames = bytearray()
        for index in range(sample_rate * 2):
            sample = int(8000 * math.sin(2 * math.pi * 440 * index / sample_rate))
            frames.extend(struct.pack("<h", sample))
        output.writeframes(frames)


def result_envelope(result: Any) -> dict[str, Any]:
    structured = result.structuredContent
    if structured:
        if "result" in structured and isinstance(structured["result"], dict):
            return structured["result"]
        return structured
    for content in result.content:
        if hasattr(content, "text"):
            return json.loads(content.text)
    raise RuntimeError("MCP tool result has no structured or JSON text content")


async def main_async() -> None:
    with tempfile.TemporaryDirectory(prefix="voxflow-mcp-smoke-") as temporary:
        root = Path(temporary)
        media = root / "input.wav"
        transcript = root / "transcript.json"
        write_audio(media)
        segments = [
            {
                "text": f"片段{index:04d}",
                "start": index * 4,
                "end": (index + 1) * 4,
                "spk": index % 2,
            }
            for index in range(500)
        ]
        transcript.write_text(
            json.dumps(
                [
                    {
                        "text": "".join(segment["text"] for segment in segments),
                        "sentence_info": segments,
                    }
                ],
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        environment = os.environ.copy()
        environment["VOXFLOW_HOME"] = str(root / "home")
        environment["VOXFLOW_JOB_INLINE"] = "1"
        parameters = StdioServerParameters(
            command="voxflow", args=["mcp", "serve"], env=environment
        )
        async with stdio_client(parameters) as streams, ClientSession(*streams) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = {tool.name for tool in tools.tools}
            assert {"project_create", "edit_preview", "export_start", "artifact_get"} <= names

            created = result_envelope(
                await session.call_tool("project_create", {"source_path": str(media)})
            )
            assert created["ok"]
            project_id = created["data"]["id"]
            imported = result_envelope(
                await session.call_tool(
                    "transcript_import",
                    {"project_id": project_id, "input_path": str(transcript)},
                )
            )
            assert imported["ok"]
            transcript_page = result_envelope(
                await session.call_tool("transcript_get", {"project_id": project_id})
            )
            assert transcript_page["data"]["total"] == 500
            assert len(transcript_page["data"]["items"]) == 50
            assert transcript_page["data"]["next_offset"] == 50
            search = result_envelope(
                await session.call_tool(
                    "transcript_search",
                    {"project_id": project_id, "query": "片段0499", "context": 2},
                )
            )
            assert search["data"]["count"] == 1
            assert len(search["data"]["matches"][0]["before"]) == 2
            timeline = result_envelope(
                await session.call_tool("timeline_get", {"project_id": project_id})
            )
            first_clip = timeline["data"]["items"][0]["id"]
            plan = {
                "schema_version": 1,
                "project_id": project_id,
                "expected_revision": 1,
                "client_request_id": "mcp-smoke-edit",
                "reason": "remove intro",
                "operations": [{"op": "delete_clips", "clip_ids": [first_clip]}],
            }
            preview = result_envelope(await session.call_tool("edit_preview", {"plan": plan}))
            assert preview["data"]["diff"]["duration_after_ms"] == 1996
            applied = result_envelope(await session.call_tool("edit_apply", {"plan": plan}))
            assert applied["data"]["revision"] == 2
            exported = result_envelope(
                await session.call_tool(
                    "export_start", {"project_id": project_id, "output_format": "mp3"}
                )
            )
            job_id = exported["data"]["id"]
            job = result_envelope(await session.call_tool("job_get", {"job_id": job_id}))
            assert job["data"]["status"] == "succeeded"
            artifact_id = job["data"]["result"]["artifact_id"]
            artifact = result_envelope(
                await session.call_tool("artifact_get", {"artifact_id": artifact_id})
            )
            assert artifact["data"]["exists"] is True
            resources = await session.list_resources()
            assert any(
                str(resource.uri) == "voxflow://projects" for resource in resources.resources
            )
            templates = await session.list_resource_templates()
            template_uris = {template.uriTemplate for template in templates.resourceTemplates}
            assert "voxflow://projects/{project_id}/summary" in template_uris
            assert "voxflow://projects/{project_id}/timeline/summary" in template_uris
            assert "voxflow://jobs/{job_id}" in template_uris
            print(
                json.dumps(
                    {
                        "ok": True,
                        "project_id": project_id,
                        "artifact_id": artifact_id,
                        "tool_count": len(names),
                    }
                )
            )


def main() -> None:
    anyio.run(main_async)


if __name__ == "__main__":
    main()
