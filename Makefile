.PHONY: sync test lint typecheck skill-check security-audit architecture-audit check install-local install-local-lite install-dev-cli

sync:
	uv sync --python 3.11 --extra dev --extra mcp --extra web --extra asr-local --extra providers --extra tts

test:
	uv run pytest

lint:
	uv run ruff format --check voxflow tests scripts app.py config.py setup.py
	uv run ruff check voxflow tests scripts app.py config.py setup.py

typecheck:
	uv run mypy voxflow

skill-check:
	uv run python scripts/check_companion_skill.py

security-audit:
	uv run python scripts/check_public_repo.py

architecture-audit:
	uv run python scripts/check_architecture.py

check: lint typecheck skill-check security-audit architecture-audit test

install-local:
	uv tool install --python 3.11 --force '.[mcp,asr-local,tts]'

install-local-lite:
	uv tool install --python 3.11 --force '.[mcp]'

install-dev-cli:
	uv tool install --python 3.11 --force --editable '.[mcp,asr-local,tts]'
