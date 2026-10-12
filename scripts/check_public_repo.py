from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = "scripts/check_public_repo.py"

BANNED_NAMES = {".DS_Store", ".env", "findings.md", "progress.md", "task_plan.md"}
BANNED_PREFIXES = ("result/", "data/", ".firecrawl/")
BANNED_SUFFIXES = (".key", ".pem", ".p12", ".pfx")

# Organization names, private hostnames, and provider key prefixes are themselves identifying,
# so they live only in the untracked .env (comma-separated, case-insensitive):
#   PUBLIC_AUDIT_PRIVATE_MARKERS=example-corp,intranet.example,corp-key-
MARKERS_ENV = "PUBLIC_AUDIT_PRIVATE_MARKERS"

SECRET_PATTERNS = {
    "AWS access key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "GitHub token": re.compile(r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"),
    "GitHub fine-grained token": re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    "Google API key": re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
    "OpenAI-style secret": re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    "Hugging Face token": re.compile(r"hf_[A-Za-z0-9]{20,}"),
    "Slack token": re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    "Stripe live secret": re.compile(r"sk_live_[A-Za-z0-9]{16,}"),
    "JSON Web Token": re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "private key": re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----"),
}


def private_markers() -> tuple[str, ...]:
    raw = os.environ.get(MARKERS_ENV)
    env_file = ROOT / ".env"
    if raw is None and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == MARKERS_ENV:
                raw = value.strip().strip("'\"")
    return tuple(item.strip().lower() for item in (raw or "").split(",") if item.strip())


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
    markers = private_markers()

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
            for marker in markers:
                if marker in lowered:
                    failures.append(f"private marker from {MARKERS_ENV} in {relative}")
            for label, pattern in SECRET_PATTERNS.items():
                if pattern.search(text):
                    failures.append(f"possible {label} in {relative}")

    if failures:
        print("Public repository audit failed:", file=sys.stderr)
        for failure in sorted(set(failures)):
            print(f"- {failure}", file=sys.stderr)
        return 1

    note = f", {len(markers)} private markers" if markers else f"; {MARKERS_ENV} not set"
    print(f"Public repository audit passed ({len(files)} tracked files checked{note}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
