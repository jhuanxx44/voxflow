"""Official MCP E2E using a real local FunASR worker, edit, and WAV export."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
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


def create_mandarin_speech(path: Path) -> None:
    aiff = path.with_suffix(".aiff")
    subprocess.run(
        [
            "say",
            "-v",
            "Meijia",
            "你好，欢迎使用语音编辑工具。今天我们测试真实语音识别。",
            "-o",
            str(aiff),
        ],
        check=True,
        timeout=60,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(aiff),
            "-ar",
            "16000",
            "-ac",
            "1",
            str(path),
        ],
        check=True,
        timeout=60,
    )


async def poll_job(session: ClientSession, job_id: str, timeout: float = 600) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        envelope = result_envelope(await session.call_tool("job_get", {"job_id": job_id}))
        assert envelope["ok"], envelope
        job = envelope["data"]
        if job["status"] == "succeeded":
            return job
        if job["status"] in {"failed", "cancelled", "interrupted"}:
            raise RuntimeError(str(job))
        await anyio.sleep(0.5)
    raise TimeoutError(f"job {job_id} did not finish within {timeout} seconds")


async def main_async() -> None:
    with tempfile.TemporaryDirectory(prefix="voxflow-mcp-real-asr-") as temporary:
        root = Path(temporary)
        source = root / "mandarin.wav"
        create_mandarin_speech(source)
        environment = os.environ.copy()
        environment["VOXFLOW_HOME"] = str(root / "home")
        parameters = StdioServerParameters(
            command="voxflow", args=["mcp", "serve"], env=environment
        )
        async with stdio_client(parameters) as streams, ClientSession(*streams) as session:
            await session.initialize()
            project = result_envelope(
                await session.call_tool("project_create", {"source_path": str(source)})
            )["data"]
            recognition = result_envelope(
                await session.call_tool(
                    "transcript_start", {"project_id": project["id"], "model": "advanced"}
                )
            )["data"]
            recognition_job = await poll_job(session, recognition["id"])
            transcript = result_envelope(
                await session.call_tool(
                    "transcript_get", {"project_id": project["id"], "limit": 20}
                )
            )["data"]
            recognized_text = "".join(segment["text"] for segment in transcript["items"])
            assert "语音" in recognized_text and "识别" in recognized_text
            assert all(segment["edit_precision"] == "token" for segment in transcript["items"])
            timeline = result_envelope(
                await session.call_tool("timeline_get", {"project_id": project["id"], "limit": 20})
            )["data"]
            first = timeline["items"][0]
            if len(timeline["items"]) > 1:
                operation = {"op": "delete_clips", "clip_ids": [first["id"]]}
            else:
                assert first["source_out_ms"] - first["source_in_ms"] > 200
                operation = {
                    "op": "trim_clip",
                    "clip_id": first["id"],
                    "source_in_ms": first["source_in_ms"] + 100,
                    "source_out_ms": first["source_out_ms"] - 100,
                }
            plan = {
                "schema_version": 1,
                "project_id": project["id"],
                "expected_revision": timeline["revision"],
                "client_request_id": "mcp-real-asr-edit",
                "reason": "真实识别后的确定性粗剪",
                "operations": [operation],
            }
            preview = result_envelope(await session.call_tool("edit_preview", {"plan": plan}))
            applied = result_envelope(await session.call_tool("edit_apply", {"plan": plan}))
            assert applied["data"]["diff"] == preview["data"]["diff"]
            export = result_envelope(
                await session.call_tool(
                    "export_start", {"project_id": project["id"], "output_format": "wav"}
                )
            )["data"]
            export_job = await poll_job(session, export["id"])
            artifact = result_envelope(
                await session.call_tool(
                    "artifact_get", {"artifact_id": export_job["result"]["artifact_id"]}
                )
            )["data"]
            assert artifact["exists"] and Path(artifact["path"]).stat().st_size > 0
            print(
                json.dumps(
                    {
                        "ok": True,
                        "project_id": project["id"],
                        "recognition_status": recognition_job["status"],
                        "recognized_text": recognized_text,
                        "segment_count": transcript["total"],
                        "edit_revision": applied["data"]["revision"],
                        "export_status": export_job["status"],
                        "artifact_id": artifact["id"],
                    },
                    ensure_ascii=False,
                )
            )


def main() -> None:
    anyio.run(main_async)


if __name__ == "__main__":
    main()
