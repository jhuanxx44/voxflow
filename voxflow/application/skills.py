"""Install and verify the bundled VoxFlow companion skill."""

from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path
from typing import Any, Literal, TypeAlias
from uuid import uuid4

from voxflow.domain.errors import ConfigError

SKILL_NAME = "voxflow"
SKILL_FILES = (Path("SKILL.md"), Path("agents/openai.yaml"))
AgentTarget: TypeAlias = Literal["codex", "claude"]
TARGET_CONFIG = {
    "codex": ("CODEX_HOME", ".codex"),
    "claude": ("CLAUDE_CONFIG_DIR", ".claude"),
}


def bundled_skill_path() -> Path:
    """Return the canonical source skill or its installed wheel copy."""
    package_root = Path(__file__).resolve().parents[1]
    repository_copy = package_root.parent / "skills" / SKILL_NAME
    if repository_copy.is_dir():
        return repository_copy
    return package_root / "skills" / SKILL_NAME


def agent_skill_path(target: AgentTarget = "codex", target_home: Path | None = None) -> Path:
    """Resolve a supported agent's skill destination without creating it."""
    try:
        environment_name, default_directory = TARGET_CONFIG[target]
    except KeyError as error:
        raise ConfigError(
            "Unsupported companion skill target",
            details={"target": target, "supported": sorted(TARGET_CONFIG)},
        ) from error
    if target_home is None:
        configured_home = os.environ.get(environment_name)
        target_home = Path(configured_home) if configured_home else Path.home() / default_directory
    return target_home.expanduser().resolve() / "skills" / SKILL_NAME


def _validate_skill(path: Path) -> None:
    missing = [str(relative) for relative in SKILL_FILES if not (path / relative).is_file()]
    if missing:
        raise ConfigError(
            "VoxFlow companion skill is incomplete",
            details={"path": str(path), "missing": missing},
        )

    skill_text = (path / "SKILL.md").read_text(encoding="utf-8")
    if not skill_text.startswith("---\n") or "\nname: voxflow\n" not in skill_text:
        raise ConfigError(
            "VoxFlow companion skill has invalid metadata", details={"path": str(path)}
        )
    frontmatter_end = skill_text.find("\n---\n", 4)
    if frontmatter_end < 0 or "\ndescription:" not in skill_text[:frontmatter_end]:
        raise ConfigError(
            "VoxFlow companion skill has invalid metadata", details={"path": str(path)}
        )

    interface_text = (path / "agents/openai.yaml").read_text(encoding="utf-8")
    if "default_prompt:" not in interface_text or "$voxflow" not in interface_text:
        raise ConfigError(
            "VoxFlow companion skill interface metadata is invalid",
            details={"path": str(path)},
        )


def _digest(path: Path) -> str:
    digest = hashlib.sha256()
    for relative in SKILL_FILES:
        digest.update(relative.as_posix().encode())
        digest.update(b"\0")
        digest.update((path / relative).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _copy_file(source: Path, target: Path) -> None:
    if target.parent.is_symlink():
        raise ConfigError(
            "Refusing to install through a symbolic-link skill directory",
            details={"path": str(target.parent)},
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def inspect_companion_skill(
    target_home: Path | None = None, *, target: AgentTarget = "codex"
) -> dict[str, Any]:
    """Inspect the bundled skill and one supported agent installation."""
    source = bundled_skill_path()
    _validate_skill(source)
    destination = agent_skill_path(target, target_home)
    installed = all((destination / relative).is_file() for relative in SKILL_FILES)
    matches_bundled = installed and _digest(destination) == _digest(source)
    if matches_bundled:
        status = "ready"
    elif installed:
        status = "outdated"
    else:
        status = "not_installed"
    return {
        "skill": SKILL_NAME,
        "target": target,
        "bundled_path": str(source),
        "bundled_digest": _digest(source),
        "destination": str(destination),
        "installed": installed,
        "matches_bundled": matches_bundled,
        "status": status,
    }


def install_companion_skill(
    target_home: Path | None = None,
    *,
    target: AgentTarget = "codex",
    force: bool = False,
) -> dict[str, Any]:
    """Install the bundled skill for one supported agent."""
    before = inspect_companion_skill(target_home, target=target)
    if before["matches_bundled"]:
        return {**before, "changed": False}

    destination = Path(before["destination"])
    if destination.is_symlink():
        raise ConfigError(
            "Refusing to replace a symbolic-link skill directory",
            details={"destination": str(destination)},
        )
    if destination.exists() and not force:
        raise ConfigError(
            "A different VoxFlow skill is already installed; pass --force to update it",
            details={"destination": str(destination)},
        )

    source = bundled_skill_path()
    for relative in SKILL_FILES:
        _copy_file(source / relative, destination / relative)

    after = inspect_companion_skill(target_home, target=target)
    if not after["matches_bundled"]:
        raise ConfigError(
            "Installed VoxFlow skill does not match the bundled copy",
            details={"destination": str(destination)},
        )
    return {**after, "changed": True}
