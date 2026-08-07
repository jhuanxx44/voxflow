"""Installed CLI smoke test executed from outside the repository."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any


def run(*arguments: str, environment: dict[str, str]) -> dict[str, Any]:
    result = subprocess.run(
        ["voxflow", "--json", *arguments],
        capture_output=True,
        text=True,
        env=environment,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {result.stderr}\n{result.stdout}"
        )
    payload = json.loads(result.stdout)
    if not payload["ok"]:
        raise RuntimeError(str(payload))
    return payload["data"]


def write_video(path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x240:d=5:r=25",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=5:sample_rate=16000",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        check=True,
        timeout=60,
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="voxflow-cli-smoke-") as temporary:
        root = Path(temporary)
        media = root / "input.mp4"
        transcript_file = root / "transcript.json"
        edit_plan_file = root / "edit-plan.json"
        output = root / "edited.mp4"
        write_video(media)
        transcript_file.write_text(
            json.dumps(
                [
                    {
                        "text": "开场保留内容",
                        "sentence_info": [
                            {"text": "开场", "start": 0, "end": 1000, "spk": 0},
                            {"text": "保留内容", "start": 1000, "end": 2000, "spk": 0},
                        ],
                    }
                ],
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        environment = os.environ.copy()
        environment["VOXFLOW_HOME"] = str(root / "home")
        environment["VOXFLOW_JOB_INLINE"] = "1"
        doctor = run("doctor", environment=environment)
        assert doctor["status"] == "healthy"
        project = run("project", "create", str(media), environment=environment)
        project_id = project["id"]
        run(
            "transcript",
            "import",
            project_id,
            "--file",
            str(transcript_file),
            environment=environment,
        )
        timeline = run("timeline", "get", project_id, environment=environment)
        edit_plan_file.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "project_id": project_id,
                    "expected_revision": timeline["revision"],
                    "client_request_id": "installed-cli-smoke",
                    "reason": "remove intro",
                    "operations": [
                        {"op": "delete_clips", "clip_ids": [timeline["items"][0]["id"]]}
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        preview = run(
            "edit", "preview", project_id, "--plan", str(edit_plan_file), environment=environment
        )
        assert preview["diff"]["duration_after_ms"] == 1000
        run("edit", "apply", project_id, "--plan", str(edit_plan_file), environment=environment)
        exported = run(
            "export",
            "create",
            project_id,
            "--format",
            "mp4",
            "--out",
            str(output),
            "--wait",
            environment=environment,
        )
        assert exported["status"] == "succeeded"
        assert output.is_file() and output.stat().st_size > 0
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration:stream=codec_type",
                "-of",
                "json",
                str(output),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        probe_data = json.loads(probe.stdout)
        assert {stream["codec_type"] for stream in probe_data["streams"]} == {
            "audio",
            "video",
        }
        assert abs(float(probe_data["format"]["duration"]) - 1.0) <= 0.15
        print(
            json.dumps(
                {"ok": True, "project_id": project_id, "output_bytes": output.stat().st_size}
            )
        )


if __name__ == "__main__":
    main()
