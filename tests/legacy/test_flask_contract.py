from __future__ import annotations

import sys

import pytest

pytest.importorskip("flask")
pytest.importorskip("openai")
pytest.importorskip("google.genai")

from app import app  # noqa: E402


def test_legacy_flask_health_contract_and_lazy_models() -> None:
    assert "funasr" not in sys.modules
    assert "torch" not in sys.modules
    client = app.test_client()
    root = client.get("/")
    health = client.get("/health")
    server_status = client.get("/server-status")
    assert root.status_code == 200
    assert health.status_code == 200
    assert health.get_json() == {"status": "healthy", "message": "FunASR service is running"}
    assert server_status.status_code == 200
    payload = server_status.get_json()
    assert set(payload) >= {"basic", "advanced", "total_active"}
