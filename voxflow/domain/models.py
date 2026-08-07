"""Versioned persisted models for projects, transcripts, timelines, jobs, and artifacts."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(UTC)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class TranscriptStatus(StrEnum):
    NONE = "none"
    QUEUED = "queued"
    RUNNING = "running"
    READY = "ready"
    FAILED = "failed"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    INTERRUPTED = "interrupted"


class ArtifactKind(StrEnum):
    SOURCE = "source"
    EXPORT_VIDEO = "export_video"
    EXPORT_AUDIO = "export_audio"
    SUBTITLE = "subtitle"
    TRANSCRIPT = "transcript"
    REPLACEMENT_AUDIO = "replacement_audio"


class MediaInfo(StrictModel):
    duration_ms: int = Field(ge=0)
    has_video: bool
    has_audio: bool
    video_codec: str | None = None
    audio_codec: str | None = None
    width: int | None = Field(default=None, ge=0)
    height: int | None = Field(default=None, ge=0)
    format_name: str | None = None


class SourceMedia(StrictModel):
    artifact_id: str
    original_name: str
    managed_path: str
    sha256: str
    media: MediaInfo
    reference_source: bool = False


class TranscriptSummary(StrictModel):
    status: TranscriptStatus = TranscriptStatus.NONE
    model: str | None = None
    language: str | None = None
    segment_count: int = Field(default=0, ge=0)
    job_id: str | None = None
    error: dict[str, Any] | None = None


class Project(StrictModel):
    schema_version: Literal[1] = 1
    id: str
    name: str
    revision: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    source: SourceMedia
    transcript: TranscriptSummary = Field(default_factory=TranscriptSummary)
    timeline_revision_path: str = "revisions/000000.json"


class TranscriptToken(StrictModel):
    id: str
    text: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    type: Literal["word", "number", "char"] = "char"
    char_start: int | None = Field(default=None, ge=0)
    char_end: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_range(self) -> TranscriptToken:
        if self.end_ms < self.start_ms:
            raise ValueError("token end_ms must be greater than or equal to start_ms")
        return self


class TranscriptSegment(StrictModel):
    id: str
    ordinal: int = Field(ge=0)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    text: str
    speaker_id: str | None = None
    tokens: list[TranscriptToken] = Field(default_factory=list)
    edit_precision: Literal["token", "segment"] = "segment"

    @model_validator(mode="after")
    def validate_range(self) -> TranscriptSegment:
        if self.end_ms <= self.start_ms:
            raise ValueError("segment end_ms must be greater than start_ms")
        return self


class Transcript(StrictModel):
    schema_version: Literal[1] = 1
    project_id: str
    full_text: str
    model: str
    language: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    segments: list[TranscriptSegment]


class TimelineClip(StrictModel):
    id: str
    kind: Literal["source", "replacement"] = "source"
    source_segment_id: str
    source_in_ms: int = Field(ge=0)
    source_out_ms: int = Field(ge=0)
    transcript_text: str
    speaker_id: str | None = None
    token_ids: list[str] = Field(default_factory=list)
    replacement_artifact_id: str | None = None
    replacement_duration_ms: int | None = Field(default=None, gt=0)
    render_duration_ms: int | None = Field(default=None, gt=0)
    duration_policy: Literal["natural", "fit_source", "pad_or_trim"] | None = None
    stretch_ratio: float | None = Field(default=None, gt=0)
    replacement_warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_range(self) -> TimelineClip:
        if self.source_out_ms <= self.source_in_ms:
            raise ValueError("clip source_out_ms must be greater than source_in_ms")
        if self.kind == "replacement" and not self.replacement_artifact_id:
            raise ValueError("replacement clips require replacement_artifact_id")
        if self.kind == "replacement" and (
            not self.replacement_duration_ms
            or not self.render_duration_ms
            or not self.duration_policy
        ):
            raise ValueError("replacement clips require duration metadata and policy")
        return self

    @property
    def duration_ms(self) -> int:
        return self.render_duration_ms or (self.source_out_ms - self.source_in_ms)


class TimelineRevision(StrictModel):
    schema_version: Literal[1] = 1
    project_id: str
    revision: int = Field(ge=0)
    parent_revision: int | None = Field(default=None, ge=0)
    created_at: datetime = Field(default_factory=utc_now)
    reason: str = ""
    source: str = "system"
    clips: list[TimelineClip]
    speaker_labels: dict[str, str] = Field(default_factory=dict)
    speaker_merges: dict[str, str] = Field(default_factory=dict)
    client_request_id: str | None = None
    operation_digest: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def duration_ms(self) -> int:
        return sum(clip.duration_ms for clip in self.clips)


class Artifact(StrictModel):
    schema_version: Literal[1] = 1
    id: str
    project_id: str
    kind: ArtifactKind
    path: str
    mime_type: str
    size_bytes: int = Field(ge=0)
    sha256: str
    created_at: datetime = Field(default_factory=utc_now)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Job(StrictModel):
    schema_version: Literal[1] = 1
    id: str
    kind: Literal["transcribe", "export", "speech_replace"]
    project_id: str
    status: JobStatus = JobStatus.QUEUED
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    phase: str = "queued"
    request: dict[str, Any]
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    heartbeat_at: datetime | None = None
    attempt: int = Field(default=0, ge=0)
    worker_pid: int | None = None
    cancel_requested: bool = False
    log_path: str | None = None


class RenderRange(StrictModel):
    source_in_ms: int = Field(ge=0)
    source_out_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_range(self) -> RenderRange:
        if self.source_out_ms <= self.source_in_ms:
            raise ValueError("render range must have positive duration")
        return self


class RenderPlan(StrictModel):
    schema_version: Literal[1] = 1
    project_id: str
    revision: int = Field(ge=0)
    source_path: str
    source_has_video: bool
    source_has_audio: bool = True
    ranges: list[RenderRange] = Field(min_length=1)
    output_format: Literal["mp4", "mp3", "wav", "srt", "vtt"]

    @property
    def duration_ms(self) -> int:
        return sum(item.source_out_ms - item.source_in_ms for item in self.ranges)
