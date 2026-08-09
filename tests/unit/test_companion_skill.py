from __future__ import annotations

from pathlib import Path

import pytest

from voxflow.application.skills import (
    AgentTarget,
    agent_skill_path,
    inspect_companion_skill,
    install_companion_skill,
)
from voxflow.domain.errors import ConfigError


def test_bundled_companion_skill_is_valid() -> None:
    result = inspect_companion_skill()
    assert result["skill"] == "voxflow"
    assert result["target"] == "codex"
    assert result["bundled_digest"]
    repository_root = Path(__file__).resolve().parents[2]
    assert Path(result["bundled_path"]) == repository_root / "skills" / "voxflow"


@pytest.mark.parametrize("target", ["codex", "claude"])
def test_install_companion_skill_is_idempotent(tmp_path: Path, target: AgentTarget) -> None:
    first = install_companion_skill(tmp_path, target=target)
    assert first["changed"] is True
    assert first["status"] == "ready"
    assert first["target"] == target
    assert (tmp_path / "skills/voxflow/SKILL.md").is_file()

    second = install_companion_skill(tmp_path, target=target)
    assert second["changed"] is False
    assert second["matches_bundled"] is True


def test_agent_skill_path_uses_target_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    codex_home = tmp_path / "codex"
    claude_home = tmp_path / "claude"
    monkeypatch.setenv("CODEX_HOME", str(codex_home))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(claude_home))

    assert agent_skill_path("codex") == codex_home / "skills/voxflow"
    assert agent_skill_path("claude") == claude_home / "skills/voxflow"


def test_install_requires_force_to_update_existing_skill(tmp_path: Path) -> None:
    destination = tmp_path / "skills/voxflow"
    destination.mkdir(parents=True)
    (destination / "SKILL.md").write_text("custom", encoding="utf-8")

    with pytest.raises(ConfigError, match="--force"):
        install_companion_skill(tmp_path)

    result = install_companion_skill(tmp_path, force=True)
    assert result["changed"] is True
    assert result["matches_bundled"] is True


def test_force_install_replaces_file_symlink_without_following_it(tmp_path: Path) -> None:
    install_companion_skill(tmp_path)
    outside = tmp_path / "outside.md"
    outside.write_text("keep", encoding="utf-8")
    installed_skill = tmp_path / "skills/voxflow/SKILL.md"
    installed_skill.unlink()
    installed_skill.symlink_to(outside)

    result = install_companion_skill(tmp_path, force=True)

    assert result["matches_bundled"] is True
    assert not installed_skill.is_symlink()
    assert outside.read_text(encoding="utf-8") == "keep"
