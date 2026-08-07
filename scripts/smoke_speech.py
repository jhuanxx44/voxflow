"""Cross-interface CLI -> MCP -> renderer smoke for persistent speech replacement."""

from __future__ import annotations

import json
import math
import os
import struct
import subprocess
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


def run_cli(*arguments: str, environment: dict[str, str]) -> dict[str, Any]:
    result = subprocess.run(
        ["voxflow", "--json", *arguments],
        capture_output=True,
        text=True,
        env=environment,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"CLI failed ({result.returncode}): {result.stderr}\n{result.stdout}")
    envelope = json.loads(result.stdout)
    if not envelope["ok"]:
        raise RuntimeError(str(envelope))
    return envelope["data"]


def mcp_envelope(result: Any) -> dict[str, Any]:
    structured = result.structuredContent
    if structured:
        value = structured.get("result", structured)
        if isinstance(value, dict):
            return value
    for content in result.content:
        if hasattr(content, "text"):
            return json.loads(content.text)
    raise RuntimeError("MCP tool result has no JSON envelope")


async def run_mcp_apply(
    plan: dict[str, Any], environment: dict[str, str]
) -> tuple[dict[str, Any], dict[str, Any]]:
    parameters = StdioServerParameters(command="voxflow", args=["mcp", "serve"], env=environment)
    async with stdio_client(parameters) as streams, ClientSession(*streams) as session:
        await session.initialize()
        tools = await session.list_tools()
        assert "speech_replace_start" in {tool.name for tool in tools.tools}
        preview = mcp_envelope(await session.call_tool("edit_preview", {"plan": plan}))
        assert preview["ok"], preview
        applied = mcp_envelope(await session.call_tool("edit_apply", {"plan": plan}))
        assert applied["ok"], applied
        return preview["data"], applied["data"]


async def main_async() -> None:
    with tempfile.TemporaryDirectory(prefix="voxflow-speech-smoke-") as temporary:
        root = Path(temporary)
        media = root / "input.wav"
        transcript = root / "transcript.json"
        output = root / "replacement.wav"
        write_audio(media)
        transcript.write_text(
            json.dumps(
                [
                    {
                        "text": "原始语音保留内容",
                        "sentence_info": [
                            {"text": "原始语音", "start": 0, "end": 1000, "spk": 0},
                            {"text": "保留内容", "start": 1000, "end": 2000, "spk": 0},
                        ],
                    }
                ],
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        environment = os.environ.copy()
        environment.update(
            {
                "VOXFLOW_HOME": str(root / "home"),
                "VOXFLOW_JOB_INLINE": "1",
                "VOXFLOW_TTS_PROVIDER": "fake",
            }
        )
        project = run_cli("project", "create", str(media), environment=environment)
        project_id = project["id"]
        run_cli(
            "transcript",
            "import",
            project_id,
            "--file",
            str(transcript),
            environment=environment,
        )
        timeline = run_cli("timeline", "get", project_id, environment=environment)
        candidate_job = run_cli(
            "speech",
            "replace-start",
            project_id,
            timeline["items"][0]["id"],
            "--expected-revision",
            str(timeline["revision"]),
            "--text",
            "新的语音",
            "--wait",
            environment=environment,
        )
        assert candidate_job["status"] == "succeeded", candidate_job
        operation = candidate_job["result"]["recommended_operation"]
        plan = {
            "schema_version": 1,
            "project_id": project_id,
            "expected_revision": timeline["revision"],
            "client_request_id": "speech-cross-interface-smoke",
            "reason": "CLI candidate attached through MCP",
            "operations": [operation],
        }
        preview, applied = await run_mcp_apply(plan, environment)
        assert applied["revision"] == 2
        assert preview["diff"]["duration_after_ms"] == 1720

        exported = run_cli(
            "export",
            "create",
            project_id,
            "--format",
            "wav",
            "--out",
            str(output),
            "--wait",
            environment=environment,
        )
        assert exported["status"] == "succeeded", exported
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(output),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        duration = float(probe.stdout.strip())
        assert abs(duration - 1.72) <= 0.04
        print(
            json.dumps(
                {
                    "ok": True,
                    "project_id": project_id,
                    "candidate_artifact_id": candidate_job["result"]["artifact_id"],
                    "revision": applied["revision"],
                    "duration_seconds": duration,
                }
            )
        )


def main() -> None:
    anyio.run(main_async)


if __name__ == "__main__":
    main()
