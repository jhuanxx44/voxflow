from __future__ import annotations

import io
from dataclasses import replace
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
    assert capabilities.get_json()["meta"]["request_id"] == capabilities.headers["X-Request-ID"]

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
    assert conflict.get_json()["meta"]["request_id"] == conflict.headers["X-Request-ID"]

    legacy = client.post("/export-media", json={})
    assert legacy.headers["Deprecation"] == "true"
    assert "successor-version" in legacy.headers["Link"]
    legacy_tts = client.post("/tts", json={})
    assert legacy_tts.headers["Deprecation"] == "true"
    assert "speech-replacements" in legacy_tts.headers["Link"]


def test_api_v1_speech_candidate_preview_and_attach(settings: Settings, wav_file: Path) -> None:
    runtime = Runtime.create(replace(settings, tts_provider="fake"))
    project = runtime.store.create(wav_file)
    runtime.transcripts.import_payload(
        project.id,
        {
            "text": "原始语音",
            "segments": [{"start": 0, "end": 1000, "text": "原始语音"}],
        },
    )
    clip = runtime.store.get_timeline(project.id).clips[0]
    app.config["TESTING"] = True
    app.config["VOXFLOW_RUNTIME"] = runtime
    client = app.test_client()

    submitted = client.post(
        f"/api/v1/projects/{project.id}/speech-replacements",
        json={
            "expected_revision": 1,
            "clip_id": clip.id,
            "text": "新的语音",
            "duration_policy": "natural",
            "parameters": {"fake_duration_ms": 1200},
        },
    )
    assert submitted.status_code == 202
    job = submitted.get_json()["data"]
    assert job["status"] == "succeeded"
    assert "path" not in job["result"]
    operation = job["result"]["recommended_operation"]
    artifact_id = job["result"]["artifact_id"]
    preview_content = client.get(job["result"]["download_url"])
    assert preview_content.status_code == 200
    assert preview_content.headers["Content-Disposition"].startswith("inline")

    plan = {
        "schema_version": 1,
        "project_id": project.id,
        "expected_revision": 1,
        "client_request_id": "web-speech-attach",
        "reason": "Web candidate attach",
        "operations": [operation],
    }
    preview = client.post(f"/api/v1/projects/{project.id}/edits/preview", json=plan)
    applied = client.post(f"/api/v1/projects/{project.id}/edits", json=plan)
    assert preview.status_code == 200
    assert applied.status_code == 201
    assert preview.get_json()["data"]["diff"] == applied.get_json()["data"]["diff"]
    timeline = client.get(f"/api/v1/projects/{project.id}/timeline").get_json()["data"]
    assert timeline["revision"] == 2
    assert timeline["items"][0]["kind"] == "replacement"
    assert timeline["items"][0]["replacement_artifact_id"] == artifact_id
