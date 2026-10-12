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
            ),
            TranscriptSegment(
                id="seg_b",
                ordinal=1,
                start_ms=1000,
                end_ms=2000,
                text="后半段",
                speaker_id="spk_1",
                edit_precision="segment",
            ),
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
            source_segment_id="seg_b",
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


def test_source_trim_can_restore_segment_content_after_commit() -> None:
    base = timeline()
    base.clips[0].transcript_text = "手工修订"
    base.clips[0].token_ids = ["tok_b"]
    inward = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "trim-inward",
            "operations": [
                {
                    "op": "trim_clip",
                    "clip_id": "clip_a",
                    "source_in_ms": 300,
                    "source_out_ms": 900,
                }
            ],
        }
    )
    trimmed = reduce_edit_plan(base, transcript(), inward).timeline
    assert trimmed.clips[0].token_ids == ["tok_b", "tok_c"]
    assert trimmed.clips[0].transcript_text == "好啊"

    outward = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 2,
            "client_request_id": "trim-outward",
            "operations": [
                {
                    "op": "trim_clip",
                    "clip_id": "clip_a",
                    "source_in_ms": 0,
                    "source_out_ms": 1000,
                }
            ],
        }
    )
    restored = reduce_edit_plan(trimmed, transcript(), outward).timeline.clips[0]
    assert (restored.source_in_ms, restored.source_out_ms) == (0, 1000)
    assert restored.token_ids == ["tok_a", "tok_b", "tok_c"]
    assert restored.transcript_text == "你好啊"


def test_split_child_can_restore_across_full_immutable_segment() -> None:
    split = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "split-before-restore",
            "operations": [{"op": "split_clip", "clip_id": "clip_a", "at_ms": 500}],
        }
    )
    split_timeline = reduce_edit_plan(timeline(), transcript(), split).timeline
    left, right = split_timeline.clips
    restore = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 2,
            "client_request_id": "restore-split-child",
            "operations": [
                {
                    "op": "trim_clip",
                    "clip_id": left.id,
                    "source_in_ms": 0,
                    "source_out_ms": 900,
                }
            ],
        }
    )
    restored = reduce_edit_plan(split_timeline, transcript(), restore).timeline
    assert restored.clips[0].token_ids == ["tok_a", "tok_b", "tok_c"]
    assert restored.clips[0].transcript_text == "你好啊"
    assert restored.clips[0].source_out_ms > right.source_in_ms


def test_segment_precision_trim_uses_immutable_segment_text() -> None:
    base = timeline()
    base.clips = [
        TimelineClip(
            id="clip_b",
            source_segment_id="seg_b",
            source_in_ms=1200,
            source_out_ms=1800,
            transcript_text="手工修订",
            token_ids=["tok_stale"],
        )
    ]
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "segment-precision-trim",
            "operations": [
                {
                    "op": "trim_clip",
                    "clip_id": "clip_b",
                    "source_in_ms": 1000,
                    "source_out_ms": 1900,
                }
            ],
        }
    )
    result = reduce_edit_plan(base, transcript(), plan).timeline.clips[0]
    assert result.transcript_text == "后半段"
    assert result.token_ids == []


def test_segment_precision_split_is_rejected_without_duplicating_text() -> None:
    base = timeline()
    base.clips = [
        TimelineClip(
            id="clip_b",
            source_segment_id="seg_b",
            source_in_ms=1000,
            source_out_ms=2000,
            transcript_text="后半段",
            token_ids=[],
        )
    ]
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "reject-segment-precision-split",
            "operations": [{"op": "split_clip", "clip_id": "clip_b", "at_ms": 1500}],
        }
    )
    with pytest.raises(ValidationError, match="Segment-precision"):
        reduce_edit_plan(base, transcript(), plan)


def test_trim_restore_keeps_zero_duration_terminal_punctuation() -> None:
    source = transcript()
    source.segments[0].tokens.append(
        TranscriptToken(id="tok_stop", text="。", start_ms=1000, end_ms=1000, type="char")
    )
    source.segments[0].text = "你好啊。"
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "restore-terminal-punctuation",
            "operations": [
                {
                    "op": "trim_clip",
                    "clip_id": "clip_a",
                    "source_in_ms": 0,
                    "source_out_ms": 1000,
                }
            ],
        }
    )
    restored = reduce_edit_plan(timeline(), source, plan).timeline.clips[0]
    assert restored.token_ids == ["tok_a", "tok_b", "tok_c", "tok_stop"]
    assert restored.transcript_text == "你好啊。"


@pytest.mark.parametrize("operation", ["trim_clip", "split_clip"])
def test_replacement_clips_reject_source_range_operations(operation: str) -> None:
    base = timeline()
    base.clips[0] = TimelineClip(
        **{
            **base.clips[0].model_dump(mode="python"),
            "kind": "replacement",
            "replacement_artifact_id": "art_replacement",
            "replacement_duration_ms": 900,
            "render_duration_ms": 1000,
            "duration_policy": "fit_source",
            "stretch_ratio": 1.0,
        }
    )
    payload = (
        {
            "op": "trim_clip",
            "clip_id": "clip_a",
            "source_in_ms": 100,
            "source_out_ms": 900,
        }
        if operation == "trim_clip"
        else {"op": "split_clip", "clip_id": "clip_a", "at_ms": 500}
    )
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": f"reject-replacement-{operation}",
            "operations": [payload],
        }
    )
    expected = "cannot be trimmed" if operation == "trim_clip" else "cannot be split"
    with pytest.raises(ValidationError, match=expected):
        reduce_edit_plan(base, transcript(), plan)


@pytest.mark.parametrize(
    ("source_in_ms", "source_out_ms"),
    [(-1, 500), (0, 1001), (500, 500)],
)
def test_source_trim_rejects_segment_overflow_and_zero_duration(
    source_in_ms: int, source_out_ms: int
) -> None:
    payload = {
        "op": "trim_clip",
        "clip_id": "clip_a",
        "source_in_ms": source_in_ms,
        "source_out_ms": source_out_ms,
    }
    if source_in_ms < 0:
        with pytest.raises(ValueError):
            EditPlan.model_validate(
                {
                    "project_id": "prj_test",
                    "expected_revision": 1,
                    "client_request_id": "invalid-negative-trim",
                    "operations": [payload],
                }
            )
        return
    plan = EditPlan.model_validate(
        {
            "project_id": "prj_test",
            "expected_revision": 1,
            "client_request_id": "invalid-segment-trim",
            "operations": [payload],
        }
    )
    with pytest.raises(ValidationError, match="source transcript segment"):
        reduce_edit_plan(timeline(), transcript(), plan)


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
