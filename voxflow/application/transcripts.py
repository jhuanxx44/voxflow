"""Transcript import, pagination, search, and context use cases."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from voxflow.domain.errors import ValidationError
from voxflow.infrastructure.asr import normalize_asr_result
from voxflow.infrastructure.project_store import ProjectStore


class TranscriptService:
    def __init__(self, store: ProjectStore) -> None:
        self.store = store

    def import_payload(
        self,
        project_id: str,
        payload: Any,
        *,
        model: str = "imported",
        language: str | None = "zh",
    ) -> dict[str, Any]:
        self.store.get(project_id)
        transcript = normalize_asr_result(project_id, payload, model=model, language=language)
        project = self.store.save_transcript(transcript)
        return {
            "project_id": project_id,
            "revision": project.revision,
            "segment_count": len(transcript.segments),
            "edit_precision": {
                "token": sum(segment.edit_precision == "token" for segment in transcript.segments),
                "segment": sum(
                    segment.edit_precision == "segment" for segment in transcript.segments
                ),
            },
        }

    def import_file(
        self,
        project_id: str,
        input_path: Path,
        *,
        model: str = "imported",
        language: str | None = "zh",
    ) -> dict[str, Any]:
        resolved = self.store.resolve_input_path(input_path)
        with resolved.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        return self.import_payload(project_id, payload, model=model, language=language)

    def get(self, project_id: str, *, offset: int = 0, limit: int = 50) -> dict[str, Any]:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValidationError(
                "Transcript pagination requires 1 <= limit <= 200 and offset >= 0"
            )
        transcript = self.store.get_transcript(project_id)
        total = len(transcript.segments)
        page = transcript.segments[offset : offset + limit]
        return {
            "project_id": project_id,
            "model": transcript.model,
            "language": transcript.language,
            "items": [segment.model_dump(mode="json") for segment in page],
            "total": total,
            "limit": limit,
            "offset": offset,
            "next_offset": offset + limit if offset + limit < total else None,
            "next_cursor": offset + limit if offset + limit < total else None,
        }

    def search(
        self,
        project_id: str,
        query: str,
        *,
        context: int = 2,
        limit: int = 20,
    ) -> dict[str, Any]:
        if not query.strip():
            raise ValidationError("Search query cannot be empty")
        if not 1 <= limit <= 100 or not 0 <= context <= 10:
            raise ValidationError("Search requires 1 <= limit <= 100 and 0 <= context <= 10")
        transcript = self.store.get_transcript(project_id)
        timeline = self.store.get_timeline(project_id)
        clip_ids_by_segment: dict[str, list[str]] = {}
        for clip in timeline.clips:
            clip_ids_by_segment.setdefault(clip.source_segment_id, []).append(clip.id)
        needle = query.casefold()
        matches: list[dict[str, Any]] = []
        for index, segment in enumerate(transcript.segments):
            if needle not in segment.text.casefold():
                continue
            before = transcript.segments[max(0, index - context) : index]
            after = transcript.segments[index + 1 : index + context + 1]
            matches.append(
                {
                    "segment": segment.model_dump(mode="json"),
                    "clip_ids": clip_ids_by_segment.get(segment.id, []),
                    "before": [item.model_dump(mode="json") for item in before],
                    "after": [item.model_dump(mode="json") for item in after],
                }
            )
            if len(matches) == limit:
                break
        return {
            "project_id": project_id,
            "query": query,
            "matches": matches,
            "count": len(matches),
            "truncated": len(matches) == limit,
            "current_revision": timeline.revision,
        }

    def timeline(self, project_id: str, *, offset: int = 0, limit: int = 50) -> dict[str, Any]:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValidationError("Timeline pagination requires 1 <= limit <= 200 and offset >= 0")
        timeline = self.store.get_timeline(project_id)
        total = len(timeline.clips)
        return {
            "project_id": project_id,
            "revision": timeline.revision,
            "duration_ms": timeline.duration_ms,
            "items": [
                clip.model_dump(mode="json") for clip in timeline.clips[offset : offset + limit]
            ],
            "speaker_labels": timeline.speaker_labels,
            "speaker_merges": timeline.speaker_merges,
            "total": total,
            "limit": limit,
            "offset": offset,
            "next_offset": offset + limit if offset + limit < total else None,
            "next_cursor": offset + limit if offset + limit < total else None,
        }
