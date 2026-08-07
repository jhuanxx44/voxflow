.PHONY: sync test lint typecheck check install-local install-local-lite

sync:
	uv sync --python 3.11 --extra dev --extra mcp --extra web --extra asr-local --extra providers

test:
	uv run pytest

lint:
	uv run ruff format --check voxflow tests scripts
	uv run ruff check voxflow tests scripts

typecheck:
	uv run mypy voxflow

check: lint typecheck test

install-local:
	uv tool install --python 3.11 --force --editable '.[mcp,asr-local]'

install-local-lite:
	uv tool install --python 3.11 --force --editable '.[mcp]'
