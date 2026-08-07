from __future__ import annotations

import pytest

from voxflow.domain.errors import ValidationError
from voxflow.domain.models import (
    TimelineClip,
    TimelineRevision,
    Transcript,
    TranscriptSegment,
    TranscriptToken,
)
from voxflow.domain.operations import EditPlan, reduce_edit_plan


def transcript() -> Transcript:
    tokens = [
        TranscriptToken(id="tok_a", text="你", start_ms=0, end_ms=300),
        TranscriptToken(id="tok_b", text="好", start_ms=300, end_ms=600),
        TranscriptToken(id="tok_c", text="啊", start_ms=600, end_ms=900),
    ]
    return Transcript(
        project_id="prj_test",
        full_text="你好啊",
        model="fixture",
        segments=[
            TranscriptSegment(
                id="seg_a",
                ordinal=0,
                start_ms=0,
                end_ms=1000,
                text="你好啊",
                tokens=tokens,
                edit_precision="token",
            )
        ],
    )


def timeline() -> TimelineRevision:
    return TimelineRevision(
        project_id="prj_test",
        revision=1,
        parent_revision=0,
        clips=[
            TimelineClip(
                id="clip_a",
                source_segment_id="seg_a",
                source_in_ms=0,
                source_out_ms=1000,
                transcript_text="你好啊",
                speaker_id="spk_0",
                token_ids=["tok_a", "tok_b", "tok_c"],
            )
        ],
    )


def test_delete_token_range_splits_and_removes_time() -> None:
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "test-delete",
            "operations": [
                {
                    "op": "delete_ranges",
                    "clip_id": "clip_a",
                    "start_token_id": "tok_b",
                    "end_token_id": "tok_b",
                }
            ],
        }
    )
    preview = reduce_edit_plan(timeline(), transcript(), plan)
    assert preview.diff.duration_before_ms == 1000
    assert preview.diff.duration_after_ms == 700
    assert len(preview.timeline.clips) == 2
    assert [clip.transcript_text for clip in preview.timeline.clips] == ["你", "啊"]


def test_correct_transcript_does_not_change_duration() -> None:
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "test-correct",
            "operations": [{"op": "correct_transcript", "clip_id": "clip_a", "text": "您好"}],
        }
    )
    preview = reduce_edit_plan(timeline(), transcript(), plan)
    assert preview.timeline.clips[0].transcript_text == "您好"
    assert preview.diff.duration_delta_ms == 0


def test_move_trim_speaker_and_split_operations() -> None:
    base = timeline()
    base.clips.append(
        TimelineClip(
            id="clip_b",
            source_segment_id="seg_a",
            source_in_ms=1000,
            source_out_ms=2000,
            transcript_text="后半段",
            speaker_id="spk_1",
        )
    )
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "test-composite",
            "operations": [
                {
                    "op": "move_clip",
                    "clip_id": "clip_b",
                    "anchor_clip_id": "clip_a",
                    "position": "before",
                },
                {
                    "op": "trim_clip",
                    "clip_id": "clip_b",
                    "source_in_ms": 1100,
                    "source_out_ms": 1900,
                },
                {"op": "rename_speaker", "speaker_id": "spk_1", "name": "主持人"},
                {
                    "op": "merge_speakers",
                    "from_speaker_id": "spk_1",
                    "to_speaker_id": "spk_0",
                },
                {"op": "split_clip", "clip_id": "clip_a", "at_ms": 500},
            ],
        }
    )
    preview = reduce_edit_plan(base, transcript(), plan)
    assert preview.timeline.clips[0].id == "clip_b"
    assert preview.timeline.clips[0].duration_ms == 800
    assert preview.timeline.clips[0].speaker_id == "spk_0"
    assert preview.timeline.speaker_labels["spk_1"] == "主持人"
    assert len(preview.timeline.clips) == 3


def test_speaker_operations_reject_unknown_ids() -> None:
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "unknown-speaker",
            "operations": [{"op": "rename_speaker", "speaker_id": "spk_missing", "name": "未知"}],
        }
    )
    with pytest.raises(ValidationError, match="Speaker does not exist"):
        reduce_edit_plan(timeline(), transcript(), plan)
