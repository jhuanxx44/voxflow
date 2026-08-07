"""Official MCP client E2E over a 601-second source and 1202 transcript segments."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


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


def create_source(path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=601:sample_rate=16000",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "32k",
            str(path),
        ],
        check=True,
        timeout=120,
    )


async def main_async() -> None:
    with tempfile.TemporaryDirectory(prefix="voxflow-mcp-long-") as temporary:
        root = Path(temporary)
        source = root / "input-601s.mp3"
        transcript_path = root / "transcript-1202.json"
        create_source(source)
        segments = [
            {
                "text": f"长音频片段{index:04d}",
                "start": index * 500,
                "end": (index + 1) * 500,
                "spk": index % 2,
            }
            for index in range(1202)
        ]
        transcript_path.write_text(
            json.dumps(
                [{"text": "".join(item["text"] for item in segments), "sentence_info": segments}],
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
            created = result_envelope(
                await session.call_tool("project_create", {"source_path": str(source)})
            )
            assert created["ok"]
            project_id = created["data"]["id"]
            imported = result_envelope(
                await session.call_tool(
                    "transcript_import",
                    {"project_id": project_id, "input_path": str(transcript_path)},
                )
            )
            assert imported["data"]["segment_count"] == 1202
            first_page = result_envelope(
                await session.call_tool("timeline_get", {"project_id": project_id, "limit": 200})
            )["data"]
            assert len(first_page["items"]) == 200
            assert first_page["next_cursor"] == 200
            last_page = result_envelope(
                await session.call_tool(
                    "timeline_get",
                    {"project_id": project_id, "offset": 1201, "limit": 1},
                )
            )["data"]
            deleted_ids = [first_page["items"][index]["id"] for index in range(10, 200, 20)]
            first_clip_id = first_page["items"][0]["id"]
            last_clip_id = last_page["items"][0]["id"]
            plan = {
                "schema_version": 1,
                "project_id": project_id,
                "expected_revision": 1,
                "client_request_id": "mcp-601-second-rough-cut",
                "reason": "删除十处片段，并把收尾片段移到开头",
                "operations": [
                    {"op": "delete_clips", "clip_ids": deleted_ids},
                    {
                        "op": "move_clip",
                        "clip_id": last_clip_id,
                        "anchor_clip_id": first_clip_id,
                        "position": "before",
                    },
                ],
            }
            preview = result_envelope(await session.call_tool("edit_preview", {"plan": plan}))
            assert preview["data"]["diff"]["duration_after_ms"] == 596_000
            applied = result_envelope(await session.call_tool("edit_apply", {"plan": plan}))
            assert applied["data"]["diff"] == preview["data"]["diff"]
            submitted = result_envelope(
                await session.call_tool(
                    "export_start", {"project_id": project_id, "output_format": "mp3"}
                )
            )
            job = result_envelope(
                await session.call_tool("job_get", {"job_id": submitted["data"]["id"]})
            )
            assert job["data"]["status"] == "succeeded", job
            artifact = result_envelope(
                await session.call_tool(
                    "artifact_get", {"artifact_id": job["data"]["result"]["artifact_id"]}
                )
            )["data"]
            probe = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    artifact["path"],
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            duration_seconds = float(probe.stdout.strip())
            assert abs(duration_seconds - 596.0) <= 0.2
            print(
                json.dumps(
                    {
                        "ok": True,
                        "source_duration_seconds": 601,
                        "output_duration_seconds": duration_seconds,
                        "segment_count": 1202,
                        "deleted_clip_count": len(deleted_ids),
                        "project_id": project_id,
                        "artifact_id": artifact["id"],
                    }
                )
            )


def main() -> None:
    anyio.run(main_async)


if __name__ == "__main__":
    main()
