"""Two-phase persistent speech replacement use cases."""

from __future__ import annotations

from typing import Any, Literal

from voxflow.application.jobs import JobService
from voxflow.domain.errors import RevisionConflictError, ValidationError
from voxflow.domain.operations import clip_fingerprint
from voxflow.infrastructure.catalog import Catalog
from voxflow.infrastructure.project_store import ProjectStore


class SpeechService:
    def __init__(self, store: ProjectStore, jobs: JobService, catalog: Catalog) -> None:
        self.store = store
        self.jobs = jobs
        self.catalog = catalog

    def start(
        self,
        project_id: str,
        *,
        expected_revision: int,
        clip_id: str,
        text: str,
        duration_policy: Literal["natural", "fit_source", "pad_or_trim"] | None = None,
        parameters: dict[str, Any] | None = None,
        run_inline: bool | None = None,
    ) -> dict[str, Any]:
        project = self.store.get(project_id)
        if project.revision != expected_revision:
            raise RevisionConflictError(
                "Speech replacement is based on an outdated revision",
                details={
                    "expected_revision": expected_revision,
                    "current_revision": project.revision,
                },
            )
        timeline = self.store.get_timeline(project_id)
        clip = next((item for item in timeline.clips if item.id == clip_id), None)
        if clip is None:
            raise ValidationError(
                "Speech replacement clip does not exist", details={"clip_id": clip_id}
            )
        normalized_text = text.strip()
        if not normalized_text:
            raise ValidationError("Speech replacement text cannot be empty")
        selected_policy = duration_policy or (
            "fit_source" if project.source.media.has_video else "natural"
        )
        if project.source.media.has_video and selected_policy == "natural":
            raise ValidationError("Video speech replacement does not support natural ripple in v1")

        same_speaker = [
            item
            for item in timeline.clips
            if item.id != clip.id
            and item.speaker_id == clip.speaker_id
            and item.source_out_ms > item.source_in_ms
        ]
        candidates = sorted(same_speaker, key=lambda item: item.duration_ms, reverse=True)
        if not candidates:
            candidates = [clip]
        reference_ranges: list[dict[str, int]] = []
        reference_duration = 0
        for candidate in candidates:
            reference_ranges.append(
                {"start_ms": candidate.source_in_ms, "end_ms": candidate.source_out_ms}
            )
            reference_duration += candidate.source_out_ms - candidate.source_in_ms
            if reference_duration >= 5000:
                break

        job = self.jobs.submit(
            "speech_replace",
            project_id,
            {
                "expected_revision": expected_revision,
                "clip_id": clip.id,
                "clip_fingerprint": clip_fingerprint(clip),
                "text": normalized_text,
                "duration_policy": selected_policy,
                "source_duration_ms": clip.source_out_ms - clip.source_in_ms,
                "source_has_video": project.source.media.has_video,
                "reference_ranges": reference_ranges,
                "provider": self.store.settings.tts_provider,
                "parameters": parameters or {},
                "provider_schema_version": 1,
            },
            run_inline=run_inline,
        )
        return job.model_dump(mode="json")
