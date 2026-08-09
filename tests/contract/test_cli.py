from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from voxflow.application.runtime import Runtime
from voxflow.interfaces.cli.main import app
from voxflow.settings import Settings

runner = CliRunner()
GOLDEN_DIR = Path(__file__).with_name("golden")


def _golden(name: str) -> dict[str, object]:
    return json.loads((GOLDEN_DIR / name).read_text(encoding="utf-8"))


def _normalize_envelope(payload: dict[str, object]) -> dict[str, object]:
    normalized = json.loads(json.dumps(payload))
    normalized["meta"]["request_id"] = "<request_id>"
    return normalized


def test_doctor_json_is_machine_readable_and_does_not_load_funasr(tmp_path: Path) -> None:
    result = runner.invoke(app, ["--json", "--home", str(tmp_path), "doctor"])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["checks"]["funasr"]["loaded"] is False
    normalized = _normalize_envelope(payload)
    normalized["data"]["checks"]["python"]["version"] = "<python_version>"
    normalized["data"]["checks"]["storage"]["path"] = "<home>"
    normalized["data"]["checks"]["storage"]["free_bytes"] = "<free_bytes>"
    normalized["data"]["checks"]["mcp"]["ok"] = "<optional_available>"
    normalized["data"]["checks"]["funasr"]["ok"] = "<optional_available>"
    assert normalized == _golden("doctor-success.json")


def test_help_discovers_major_capabilities() -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    for command in (
        "project",
        "transcript",
        "timeline",
        "edit",
        "speech",
        "job",
        "export",
        "mcp",
        "diagnostics",
        "maintenance",
        "skill",
        "version",
    ):
        assert command in result.stdout


def test_version_and_release_commands_are_machine_discoverable(tmp_path: Path) -> None:
    untouched_home = tmp_path / "version-must-not-create-home"
    version = runner.invoke(app, ["--json", "--home", str(untouched_home), "version"])
    assert version.exit_code == 0, version.output
    payload = json.loads(version.stdout)
    assert payload["data"] == {"version": "1.0.0", "project_schema_version": 1}
    assert not untouched_home.exists()
    for command in (
        ["project", "migrate", "--help"],
        ["diagnostics", "create", "--help"],
        ["maintenance", "cleanup", "--help"],
        ["skill", "install", "--help"],
    ):
        result = runner.invoke(app, command)
        assert result.exit_code == 0, result.output


def test_skill_commands_install_and_check_packaged_companion(tmp_path: Path) -> None:
    path_result = runner.invoke(app, ["--json", "skill", "path"])
    assert path_result.exit_code == 0, path_result.output
    packaged_path = Path(json.loads(path_result.stdout)["data"]["path"])
    assert (packaged_path / "SKILL.md").is_file()
    assert json.loads(path_result.stdout)["data"]["supported_targets"] == ["codex", "claude"]

    for target in ("codex", "claude"):
        target_home = tmp_path / target
        install = runner.invoke(
            app,
            [
                "--json",
                "skill",
                "install",
                target,
                "--target-home",
                str(target_home),
            ],
        )
        assert install.exit_code == 0, install.output
        installed = json.loads(install.stdout)["data"]
        assert installed["changed"] is True
        assert installed["target"] == target

        check = runner.invoke(
            app,
            ["--json", "skill", "check", target, "--target-home", str(target_home)],
        )
        assert check.exit_code == 0, check.output
        checked = json.loads(check.stdout)["data"]
        assert checked["status"] == "ready"
        assert checked["target"] == target

    unsupported = runner.invoke(
        app,
        ["--json", "skill", "check", "other", "--target-home", str(tmp_path)],
    )
    assert unsupported.exit_code == 7, unsupported.output
    assert json.loads(unsupported.stdout)["error"]["code"] == "CONFIG_ERROR"


def test_speech_replace_start_emits_persistent_candidate_job(
    tmp_path: Path, wav_file: Path
) -> None:
    settings = Settings(home=tmp_path / "voxflow-home", job_inline=True, tts_provider="fake")
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file)
    runtime.transcripts.import_payload(
        project.id,
        [
            {
                "text": "候选语音",
                "sentence_info": [{"text": "候选语音", "start": 0, "end": 1000}],
            }
        ],
    )
    clip_id = runtime.store.get_timeline(project.id).clips[0].id
    result = runner.invoke(
        app,
        [
            "--json",
            "--home",
            str(settings.home),
            "speech",
            "replace-start",
            project.id,
            clip_id,
            "--expected-revision",
            "1",
            "--text",
            "新的语音",
            "--wait",
        ],
        env={"VOXFLOW_TTS_PROVIDER": "fake", "VOXFLOW_JOB_INLINE": "1"},
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["kind"] == "speech_replace"
    assert payload["data"]["status"] == "succeeded"
    operation = payload["data"]["result"]["recommended_operation"]
    assert operation["op"] == "attach_speech_replacement"
    assert operation["clip_id"] == clip_id


def test_json_error_uses_stable_error_envelope(tmp_path: Path) -> None:
    result = runner.invoke(
        app, ["--json", "--home", str(tmp_path), "project", "get", "prj_" + "0" * 32]
    )
    assert result.exit_code == 3
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "NOT_FOUND"
    assert _normalize_envelope(payload) == _golden("project-not-found.json")
