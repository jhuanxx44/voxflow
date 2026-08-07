"""Enforce VoxFlow dependency direction and removed-legacy boundaries."""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def check_layer(directory: str, forbidden: tuple[str, ...]) -> list[str]:
    errors: list[str] = []
    for path in sorted((ROOT / directory).rglob("*.py")):
        for name in imports(path):
            if any(name == prefix or name.startswith(f"{prefix}.") for prefix in forbidden):
                errors.append(f"{path.relative_to(ROOT)} imports forbidden layer {name}")
    return errors


def repository_python_files() -> list[Path]:
    paths = [ROOT / "app.py", ROOT / "config.py"]
    for directory in ("voxflow", "legacy_web", "tests", "scripts", "utils"):
        paths.extend((ROOT / directory).rglob("*.py"))
    return sorted(path for path in paths if path.is_file())


def main() -> int:
    errors = check_layer(
        "voxflow/domain",
        ("flask", "typer", "mcp", "legacy_web", "voxflow.application", "voxflow.interfaces"),
    )
    errors.extend(
        check_layer(
            "voxflow/application",
            ("flask", "typer", "mcp", "legacy_web", "voxflow.interfaces"),
        )
    )

    removed_files = [
        "static/index.html",
        "call_llm_example.py",
        "src/services/asrService.ts",
        "src/services/exportService.ts",
        "src/services/ttsService.ts",
    ]
    for relative in removed_files:
        if (ROOT / relative).exists():
            errors.append(f"removed legacy path returned: {relative}")
    for relative in ("routes", "services"):
        if any((ROOT / relative).glob("*.py")):
            errors.append(f"root legacy Python package returned: {relative}/")

    for path in repository_python_files():
        legacy_imports = [name for name in imports(path) if name.startswith("legacy_web")]
        if legacy_imports and not (
            path.is_relative_to(ROOT / "legacy_web")
            or path == ROOT / "app.py"
            or path.is_relative_to(ROOT / "tests" / "legacy")
        ):
            errors.append(
                f"{path.relative_to(ROOT)} crosses the legacy boundary: {legacy_imports[0]}"
            )

    project_service = (ROOT / "src/services/projectService.ts").read_text(encoding="utf-8")
    if "/api/v1" not in project_service:
        errors.append("React projectService no longer targets the versioned API")

    if errors:
        for error in errors:
            print(f"architecture error: {error}")
        return 1
    print("Architecture boundary audit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
