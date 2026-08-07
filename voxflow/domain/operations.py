"""Versioned Edit Plan models and the pure deterministic timeline reducer."""

from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal, TypeAlias

from pydantic import Field

from voxflow.domain.errors import ValidationError
from voxflow.domain.ids import derived_id
from voxflow.domain.models import (
    StrictModel,
    TimelineClip,
    TimelineRevision,
    Transcript,
    TranscriptToken,
)


class DeleteClips(StrictModel):
    op: Literal["delete_clips"]
    clip_ids: list[str] = Field(min_length=1)


class DeleteRanges(StrictModel):
    op: Literal["delete_ranges"]
    clip_id: str
    start_token_id: str
    end_token_id: str


class MoveClip(StrictModel):
    op: Literal["move_clip"]
    clip_id: str
    anchor_clip_id: str
    position: Literal["before", "after"] = "after"


class TrimClip(StrictModel):
    op: Literal["trim_clip"]
    clip_id: str
    source_in_ms: int = Field(ge=0)
    source_out_ms: int = Field(ge=0)


class SplitClip(StrictModel):
    op: Literal["split_clip"]
    clip_id: str
    at_ms: int = Field(ge=0)


class CorrectTranscript(StrictModel):
    op: Literal["correct_transcript"]
    clip_id: str
    text: str


class RenameSpeaker(StrictModel):
    op: Literal["rename_speaker"]
    speaker_id: str
    name: str


class MergeSpeakers(StrictModel):
    op: Literal["merge_speakers"]
    from_speaker_id: str
    to_speaker_id: str


class AttachSpeechReplacement(StrictModel):
    op: Literal["attach_speech_replacement"]
    clip_id: str
    artifact_id: str
    clip_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    text: str = Field(min_length=1)
    duration_policy: Literal["natural", "fit_source", "pad_or_trim"]
    replacement_duration_ms: int = Field(gt=0)
    render_duration_ms: int = Field(gt=0)
    stretch_ratio: float = Field(gt=0)


EditOperation: TypeAlias = Annotated[
    DeleteClips
    | DeleteRanges
    | MoveClip
    | TrimClip
    | SplitClip
    | CorrectTranscript
    | RenameSpeaker
    | MergeSpeakers
    | AttachSpeechReplacement,
    Field(discriminator="op"),
]


class EditPlan(StrictModel):
    schema_version: Literal[1] = 1
    project_id: str
    expected_revision: int = Field(ge=0)
    client_request_id: str = Field(min_length=1, max_length=200)
    reason: str = Field(default="", max_length=1000)
    operations: list[EditOperation] = Field(min_length=1, max_length=1000)


class EditDiff(StrictModel):
    base_revision: int
    result_revision: int
    deleted_clip_ids: list[str]
    added_clip_ids: list[str]
    moved_clip_ids: list[str]
    changed_clip_ids: list[str]
    duration_before_ms: int
    duration_after_ms: int
    duration_delta_ms: int
    warnings: list[str] = Field(default_factory=list)


class EditPreview(StrictModel):
    project_id: str
    timeline: TimelineRevision
    diff: EditDiff


def validate_timeline_invariants(timeline: TimelineRevision, *, allow_empty: bool = False) -> None:
    """Validate invariants relied on by every edit and render adapter."""
    if not allow_empty and not timeline.clips:
        raise ValidationError("Timeline must contain at least one clip")
    clip_ids = [clip.id for clip in timeline.clips]
    if len(clip_ids) != len(set(clip_ids)):
        raise ValidationError("Timeline contains duplicate clip IDs")
    for clip in timeline.clips:
        if len(clip.token_ids) != len(set(clip.token_ids)):
            raise ValidationError(
                "Timeline clip contains duplicate token IDs", details={"clip_id": clip.id}
            )
    for speaker_id in timeline.speaker_merges:
        visited: set[str] = set()
        current = speaker_id
        while current in timeline.speaker_merges:
            if current in visited:
                raise ValidationError(
                    "Speaker merge graph contains a cycle", details={"speaker_id": speaker_id}
                )
            visited.add(current)
            current = timeline.speaker_merges[current]


def clip_fingerprint(clip: TimelineClip) -> str:
    """Fingerprint the semantic clip content that a TTS candidate replaces."""
    payload = {
        "id": clip.id,
        "kind": clip.kind,
        "source_segment_id": clip.source_segment_id,
        "source_in_ms": clip.source_in_ms,
        "source_out_ms": clip.source_out_ms,
        "transcript_text": clip.transcript_text,
        "speaker_id": clip.speaker_id,
        "token_ids": clip.token_ids,
        "replacement_artifact_id": clip.replacement_artifact_id,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def _clip_index(timeline: TimelineRevision, clip_id: str) -> int:
    for index, clip in enumerate(timeline.clips):
        if clip.id == clip_id:
            return index
    raise ValidationError("Timeline clip does not exist", details={"clip_id": clip_id})


def _token_map(transcript: Transcript) -> dict[str, TranscriptToken]:
    return {token.id: token for segment in transcript.segments for token in segment.tokens}


def _tokens_for_clip(
    clip: TimelineClip, token_map: dict[str, TranscriptToken]
) -> list[TranscriptToken]:
    return [token_map[token_id] for token_id in clip.token_ids if token_id in token_map]


def _join_token_text(tokens: list[TranscriptToken]) -> str:
    text = ""
    previous: TranscriptToken | None = None
    for token in tokens:
        if previous and previous.type in {"word", "number"} and token.type in {"word", "number"}:
            text += " "
        text += token.text
        previous = token
    return text


def _slice_clip(
    clip: TimelineClip,
    *,
    clip_id: str,
    start_ms: int,
    end_ms: int,
    tokens: list[TranscriptToken],
) -> TimelineClip:
    included = [token for token in tokens if token.end_ms > start_ms and token.start_ms < end_ms]
    return TimelineClip(
        id=clip_id,
        kind=clip.kind,
        source_segment_id=clip.source_segment_id,
        source_in_ms=start_ms,
        source_out_ms=end_ms,
        transcript_text=_join_token_text(included) or clip.transcript_text,
        speaker_id=clip.speaker_id,
        token_ids=[token.id for token in included],
        replacement_artifact_id=clip.replacement_artifact_id,
    )


def reduce_edit_plan(
    timeline: TimelineRevision,
    transcript: Transcript,
    plan: EditPlan,
) -> EditPreview:
    """Apply a validated Edit Plan to a deep copy without performing I/O."""
    if timeline.project_id != plan.project_id or transcript.project_id != plan.project_id:
        raise ValidationError("Edit Plan project does not match loaded project")
    if timeline.revision != plan.expected_revision:
        raise ValidationError(
            "Edit Plan expected revision does not match timeline",
            details={"expected_revision": plan.expected_revision, "revision": timeline.revision},
        )

    validate_timeline_invariants(timeline)

    original = timeline
    result = timeline.model_copy(deep=True)
    result.revision = timeline.revision + 1
    result.parent_revision = timeline.revision
    result.reason = plan.reason
    token_map = _token_map(transcript)
    moved: set[str] = set()
    changed: set[str] = set()

    for operation_index, operation in enumerate(plan.operations):
        if isinstance(operation, DeleteClips):
            duplicate_ids = len(set(operation.clip_ids)) != len(operation.clip_ids)
            if duplicate_ids:
                raise ValidationError("delete_clips contains duplicate clip IDs")
            missing = [
                clip_id
                for clip_id in operation.clip_ids
                if all(clip.id != clip_id for clip in result.clips)
            ]
            if missing:
                raise ValidationError("Cannot delete missing clips", details={"clip_ids": missing})
            targets = set(operation.clip_ids)
            result.clips = [clip for clip in result.clips if clip.id not in targets]

        elif isinstance(operation, MoveClip):
            if operation.clip_id == operation.anchor_clip_id:
                raise ValidationError("A clip cannot be moved relative to itself")
            source_index = _clip_index(result, operation.clip_id)
            clip = result.clips.pop(source_index)
            anchor_index = _clip_index(result, operation.anchor_clip_id)
            insertion = anchor_index if operation.position == "before" else anchor_index + 1
            result.clips.insert(insertion, clip)
            moved.add(clip.id)

        elif isinstance(operation, TrimClip):
            index = _clip_index(result, operation.clip_id)
            clip = result.clips[index]
            if not (
                clip.source_in_ms
                <= operation.source_in_ms
                < operation.source_out_ms
                <= clip.source_out_ms
            ):
                raise ValidationError(
                    "Trim range must be contained by the current clip",
                    details={"clip_id": clip.id},
                )
            tokens = _tokens_for_clip(clip, token_map)
            trimmed = _slice_clip(
                clip,
                clip_id=clip.id,
                start_ms=operation.source_in_ms,
                end_ms=operation.source_out_ms,
                tokens=tokens,
            )
            result.clips[index] = trimmed
            changed.add(clip.id)

        elif isinstance(operation, SplitClip):
            index = _clip_index(result, operation.clip_id)
            clip = result.clips[index]
            if not clip.source_in_ms < operation.at_ms < clip.source_out_ms:
                raise ValidationError(
                    "Split point must be strictly inside the clip",
                    details={"clip_id": clip.id, "at_ms": operation.at_ms},
                )
            tokens = _tokens_for_clip(clip, token_map)
            left = _slice_clip(
                clip,
                clip_id=derived_id(
                    "clip",
                    plan.project_id,
                    plan.client_request_id,
                    operation_index,
                    operation.op,
                    clip.id,
                    "left",
                ),
                start_ms=clip.source_in_ms,
                end_ms=operation.at_ms,
                tokens=tokens,
            )
            right = _slice_clip(
                clip,
                clip_id=derived_id(
                    "clip",
                    plan.project_id,
                    plan.client_request_id,
                    operation_index,
                    operation.op,
                    clip.id,
                    "right",
                ),
                start_ms=operation.at_ms,
                end_ms=clip.source_out_ms,
                tokens=tokens,
            )
            result.clips[index : index + 1] = [left, right]

        elif isinstance(operation, DeleteRanges):
            index = _clip_index(result, operation.clip_id)
            clip = result.clips[index]
            tokens = _tokens_for_clip(clip, token_map)
            ids = [token.id for token in tokens]
            try:
                start_index = ids.index(operation.start_token_id)
                end_index = ids.index(operation.end_token_id)
            except ValueError as error:
                raise ValidationError(
                    "Range tokens must belong to the target clip",
                    details={"clip_id": clip.id},
                ) from error
            if start_index > end_index:
                raise ValidationError("start_token_id must precede end_token_id")
            start_ms = tokens[start_index].start_ms
            end_ms = tokens[end_index].end_ms
            pieces: list[TimelineClip] = []
            if clip.source_in_ms < start_ms:
                pieces.append(
                    _slice_clip(
                        clip,
                        clip_id=derived_id(
                            "clip",
                            plan.project_id,
                            plan.client_request_id,
                            operation_index,
                            operation.op,
                            clip.id,
                            "left",
                        ),
                        start_ms=clip.source_in_ms,
                        end_ms=start_ms,
                        tokens=tokens[:start_index],
                    )
                )
            if end_ms < clip.source_out_ms:
                pieces.append(
                    _slice_clip(
                        clip,
                        clip_id=derived_id(
                            "clip",
                            plan.project_id,
                            plan.client_request_id,
                            operation_index,
                            operation.op,
                            clip.id,
                            "right",
                        ),
                        start_ms=end_ms,
                        end_ms=clip.source_out_ms,
                        tokens=tokens[end_index + 1 :],
                    )
                )
            result.clips[index : index + 1] = pieces

        elif isinstance(operation, CorrectTranscript):
            index = _clip_index(result, operation.clip_id)
            result.clips[index].transcript_text = operation.text
            changed.add(operation.clip_id)

        elif isinstance(operation, RenameSpeaker):
            known_speakers = {
                clip.speaker_id for clip in result.clips if clip.speaker_id is not None
            } | set(result.speaker_labels)
            if operation.speaker_id not in known_speakers:
                raise ValidationError(
                    "Speaker does not exist", details={"speaker_id": operation.speaker_id}
                )
            result.speaker_labels[operation.speaker_id] = operation.name

        elif isinstance(operation, MergeSpeakers):
            if operation.from_speaker_id == operation.to_speaker_id:
                raise ValidationError("Cannot merge a speaker into itself")
            known_speakers = {
                clip.speaker_id for clip in result.clips if clip.speaker_id is not None
            } | set(result.speaker_labels)
            missing_speakers = sorted(
                {operation.from_speaker_id, operation.to_speaker_id} - known_speakers
            )
            if missing_speakers:
                raise ValidationError(
                    "Speaker does not exist", details={"speaker_ids": missing_speakers}
                )
            result.speaker_merges[operation.from_speaker_id] = operation.to_speaker_id
            for clip in result.clips:
                if clip.speaker_id == operation.from_speaker_id:
                    clip.speaker_id = operation.to_speaker_id
                    changed.add(clip.id)

        elif isinstance(operation, AttachSpeechReplacement):
            index = _clip_index(result, operation.clip_id)
            clip = result.clips[index]
            if clip_fingerprint(clip) != operation.clip_fingerprint:
                raise ValidationError(
                    "Speech replacement candidate no longer matches the clip",
                    details={"clip_id": operation.clip_id},
                )
            result.clips[index] = TimelineClip.model_validate(
                {
                    **clip.model_dump(mode="python"),
                    "kind": "replacement",
                    "replacement_artifact_id": operation.artifact_id,
                    "replacement_duration_ms": operation.replacement_duration_ms,
                    "render_duration_ms": operation.render_duration_ms,
                    "duration_policy": operation.duration_policy,
                    "stretch_ratio": operation.stretch_ratio,
                    "transcript_text": operation.text,
                    "replacement_warnings": [],
                }
            )
            changed.add(clip.id)

    if not result.clips:
        raise ValidationError("An edit cannot leave the timeline empty")
    validate_timeline_invariants(result)

    old_ids = {clip.id for clip in original.clips}
    new_ids = {clip.id for clip in result.clips}
    before = original.duration_ms
    after = result.duration_ms
    diff = EditDiff(
        base_revision=original.revision,
        result_revision=result.revision,
        deleted_clip_ids=sorted(old_ids - new_ids),
        added_clip_ids=sorted(new_ids - old_ids),
        moved_clip_ids=sorted(moved),
        changed_clip_ids=sorted(changed),
        duration_before_ms=before,
        duration_after_ms=after,
        duration_delta_ms=after - before,
    )
    return EditPreview(project_id=plan.project_id, timeline=result, diff=diff)
