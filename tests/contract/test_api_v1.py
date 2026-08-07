from __future__ import annotations

import io
from pathlib import Path

import pytest

pytest.importorskip("flask")
pytest.importorskip("openai")
pytest.importorskip("google.genai")

from app import app  # noqa: E402
from voxflow.application.runtime import Runtime  # noqa: E402
from voxflow.settings import Settings  # noqa: E402


def test_api_v1_project_transcript_edit_restore_and_export(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    app.config["TESTING"] = True
    app.config["VOXFLOW_RUNTIME"] = runtime
    client = app.test_client()

    capabilities = client.get("/api/v1/capabilities")
    assert capabilities.status_code == 200
    assert capabilities.get_json()["data"]["export_formats"] == [
        "mp3",
        "mp4",
        "srt",
        "vtt",
        "wav",
    ]

    with wav_file.open("rb") as handle:
        created_response = client.post(
            "/api/v1/projects",
            data={"name": "Web project", "media": (io.BytesIO(handle.read()), "sample.wav")},
            content_type="multipart/form-data",
        )
    assert created_response.status_code == 201
    created = created_response.get_json()["data"]
    project_id = created["id"]
    assert created["revision"] == 0
    assert created["source_url"].endswith(f"/{project_id}/source")
    assert "managed_path" not in created["source"]
    assert client.get(created["source_url"]).status_code == 200

    imported = client.post(
        f"/api/v1/projects/{project_id}/transcripts/import",
        json={
            "payload": {
                "text": "hello world",
                "segments": [
                    {"start": 0, "end": 2000, "text": "hello", "spk": 0},
                    {"start": 2000, "end": 4000, "text": "world", "spk": 1},
                ],
            }
        },
    )
    assert imported.status_code == 201
    timeline = client.get(f"/api/v1/projects/{project_id}/timeline?limit=200").get_json()["data"]
    assert timeline["revision"] == 1
    assert timeline["total"] == 2
    first, second = timeline["items"]

    plan = {
        "schema_version": 1,
        "project_id": project_id,
        "expected_revision": 1,
        "client_request_id": "web-contract-edit",
        "reason": "Web contract",
        "operations": [
            {
                "op": "move_clip",
                "clip_id": second["id"],
                "anchor_clip_id": first["id"],
                "position": "before",
            },
            {"op": "rename_speaker", "speaker_id": "spk_0", "name": "Host"},
            {
                "op": "merge_speakers",
                "from_speaker_id": "spk_1",
                "to_speaker_id": "spk_0",
            },
        ],
    }
    preview = client.post(f"/api/v1/projects/{project_id}/edits/preview", json=plan)
    applied = client.post(f"/api/v1/projects/{project_id}/edits", json=plan)
    assert preview.status_code == 200
    assert applied.status_code == 201
    assert preview.get_json()["data"]["diff"] == applied.get_json()["data"]["diff"]

    stale = client.post(f"/api/v1/projects/{project_id}/edits", json=plan)
    assert stale.status_code == 201
    assert stale.get_json()["data"]["idempotent_replay"] is True

    restored = client.post(
        f"/api/v1/projects/{project_id}/restore",
        json={
            "expected_revision": 2,
            "to_revision": 1,
            "client_request_id": "web-contract-undo",
        },
    )
    assert restored.status_code == 201
    assert restored.get_json()["data"]["revision"] == 3

    export_job = client.post(f"/api/v1/projects/{project_id}/exports", json={"format": "srt"})
    assert export_job.status_code == 202
    job_id = export_job.get_json()["data"]["id"]
    job = client.get(f"/api/v1/jobs/{job_id}").get_json()["data"]
    assert job["status"] == "succeeded"
    assert "log_path" not in job
    assert "path" not in job["result"]
    artifact_id = job["result"]["artifact_id"]
    artifact = client.get(f"/api/v1/artifacts/{artifact_id}").get_json()["data"]
    assert artifact["download_url"].endswith(f"/{artifact_id}/content")
    assert "path" not in artifact
    assert client.get(artifact["download_url"]).status_code == 200


def test_api_v1_revision_conflict_and_legacy_deprecation(
    settings: Settings, wav_file: Path
) -> None:
    runtime = Runtime.create(settings)
    project = runtime.store.create(wav_file).model_dump(mode="json")
    runtime.transcripts.import_payload(
        project["id"],
        {
            "text": "hello",
            "segments": [{"start": 0, "end": 1000, "text": "hello"}],
        },
    )
    app.config["TESTING"] = True
    app.config["VOXFLOW_RUNTIME"] = runtime
    client = app.test_client()
    project_id = project["id"]

    conflict = client.post(
        f"/api/v1/projects/{project_id}/edits",
        json={
            "schema_version": 1,
            "project_id": project_id,
            "expected_revision": 0,
            "client_request_id": "stale-web-edit",
            "reason": "stale",
            "operations": [{"op": "delete_clips", "clip_ids": ["clip_missing"]}],
        },
    )
    assert conflict.status_code == 409
    assert conflict.get_json()["error"]["code"] == "REVISION_CONFLICT"

    legacy = client.post("/export-media", json={})
    assert legacy.headers["Deprecation"] == "true"
    assert "successor-version" in legacy.headers["Link"]
