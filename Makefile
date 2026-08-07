.PHONY: sync test lint typecheck check install-local install-local-lite

sync:
	uv sync --python 3.11 --extra dev --extra mcp --extra web --extra asr-local --extra providers --extra tts

test:
	uv run pytest

lint:
	uv run ruff format --check voxflow tests scripts app.py routes/api_v1.py config.py
	uv run ruff check voxflow tests scripts app.py routes/api_v1.py config.py

typecheck:
	uv run mypy voxflow routes/api_v1.py

check: lint typecheck test

install-local:
	uv tool install --python 3.11 --force --editable '.[mcp,asr-local,tts]'

install-local-lite:
	uv tool install --python 3.11 --force --editable '.[mcp]'
