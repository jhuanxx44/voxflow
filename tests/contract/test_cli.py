from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from voxflow.interfaces.cli.main import app

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
    for command in ("project", "transcript", "timeline", "edit", "job", "export", "mcp"):
        assert command in result.stdout


def test_json_error_uses_stable_error_envelope(tmp_path: Path) -> None:
    result = runner.invoke(
        app, ["--json", "--home", str(tmp_path), "project", "get", "prj_" + "0" * 32]
    )
    assert result.exit_code == 3
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "NOT_FOUND"
    assert _normalize_envelope(payload) == _golden("project-not-found.json")
