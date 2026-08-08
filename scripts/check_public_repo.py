from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = "scripts/check_public_repo.py"

BANNED_NAMES = {".DS_Store", ".env", "findings.md", "progress.md", "task_plan.md"}
BANNED_PREFIXES = ("result/", "data/", ".firecrawl/")
BANNED_SUFFIXES = (".key", ".pem", ".p12", ".pfx")

PRIVATE_MARKERS = (
    "bilibili" + ".co",
    "bilibili" + ".local",
)

SECRET_PATTERNS = {
    "AWS access key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "GitHub token": re.compile(r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"),
    "GitHub fine-grained token": re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    "Google API key": re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
    "OpenAI-style secret": re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    "organization provider secret": re.compile(r"bsk-[A-Za-z0-9_-]{20,}"),
    "Hugging Face token": re.compile(r"hf_[A-Za-z0-9]{20,}"),
    "Slack token": re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    "Stripe live secret": re.compile(r"sk_live_[A-Za-z0-9]{16,}"),
    "JSON Web Token": re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "private key": re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----"),
}


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [item.decode() for item in result.stdout.split(b"\0") if item]


def main() -> int:
    failures: list[str] = []
    files = tracked_files()

    for relative in files:
        path = Path(relative)
        if path.name in BANNED_NAMES:
            failures.append(f"tracked private/generated file: {relative}")
        if relative.startswith(BANNED_PREFIXES):
            failures.append(f"tracked runtime data: {relative}")
        if relative.lower().endswith(BANNED_SUFFIXES):
            failures.append(f"tracked key material: {relative}")

        absolute = ROOT / relative
        if not absolute.exists():
            # Audit the proposed working tree; staged/unstaged deletions are not public content.
            continue
        try:
            raw = absolute.read_bytes()
        except OSError as error:
            failures.append(f"cannot read tracked file {relative}: {error}")
            continue

        if b"\0" in raw[:8192]:
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue

        if relative != SELF:
            lowered = text.lower()
            for marker in PRIVATE_MARKERS:
                if marker in lowered:
                    failures.append(f"private infrastructure marker in {relative}")
            for label, pattern in SECRET_PATTERNS.items():
                if pattern.search(text):
                    failures.append(f"possible {label} in {relative}")

    if failures:
        print("Public repository audit failed:", file=sys.stderr)
        for failure in sorted(set(failures)):
            print(f"- {failure}", file=sys.stderr)
        return 1

    print(f"Public repository audit passed ({len(files)} tracked files checked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
