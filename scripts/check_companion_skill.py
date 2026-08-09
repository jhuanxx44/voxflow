from __future__ import annotations

from voxflow.application.skills import inspect_companion_skill


def main() -> int:
    result = inspect_companion_skill()
    print(
        "VoxFlow companion skill passed "
        f"({result['bundled_digest'][:12]}, {result['bundled_path']})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
