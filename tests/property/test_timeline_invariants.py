from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from voxflow.domain.errors import ValidationError
from voxflow.domain.models import (
    TimelineClip,
    TimelineRevision,
    Transcript,
    TranscriptSegment,
    TranscriptToken,
)
from voxflow.domain.operations import EditPlan, reduce_edit_plan, validate_timeline_invariants


def _fixture() -> tuple[TimelineRevision, Transcript]:
    tokens = [
        TranscriptToken(
            id=f"tok_{index}",
            text=str(index),
            start_ms=index * 100,
            end_ms=(index + 1) * 100,
            type="number",
        )
        for index in range(10)
    ]
    transcript = Transcript(
        project_id="prj_property",
        full_text="0123456789",
        model="fixture",
        segments=[
            TranscriptSegment(
                id="seg_property",
                ordinal=0,
                start_ms=0,
                end_ms=1000,
                text="0123456789",
                tokens=tokens,
                edit_precision="token",
            )
        ],
    )
    timeline = TimelineRevision(
        project_id="prj_property",
        revision=1,
        parent_revision=0,
        clips=[
            TimelineClip(
                id="clip_property",
                source_segment_id="seg_property",
                source_in_ms=0,
                source_out_ms=1000,
                transcript_text="0123456789",
                token_ids=[token.id for token in tokens],
            )
        ],
    )
    return timeline, transcript


@given(split_ms=st.integers(min_value=1, max_value=999))
def test_split_is_deterministic_and_preserves_timeline_invariants(split_ms: int) -> None:
    timeline, transcript = _fixture()
    plan = EditPlan.model_validate(
        {
            "project_id": timeline.project_id,
            "expected_revision": timeline.revision,
            "client_request_id": "property-split",
            "operations": [{"op": "split_clip", "clip_id": "clip_property", "at_ms": split_ms}],
        }
    )
    first = reduce_edit_plan(timeline, transcript, plan)
    second = reduce_edit_plan(timeline, transcript, plan)
    validate_timeline_invariants(first.timeline)
    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.timeline.duration_ms == timeline.duration_ms
    assert all(clip.duration_ms > 0 for clip in first.timeline.clips)


@given(start=st.integers(min_value=0, max_value=998), width=st.integers(min_value=1, max_value=999))
def test_trim_never_escapes_source_range(start: int, width: int) -> None:
    timeline, transcript = _fixture()
    end = min(1000, start + width)
    plan = EditPlan.model_validate(
        {
            "project_id": timeline.project_id,
            "expected_revision": timeline.revision,
            "client_request_id": "property-trim",
            "operations": [
                {
                    "op": "trim_clip",
                    "clip_id": "clip_property",
                    "source_in_ms": start,
                    "source_out_ms": end,
                }
            ],
        }
    )
    result = reduce_edit_plan(timeline, transcript, plan)
    validate_timeline_invariants(result.timeline)
    clip = result.timeline.clips[0]
    assert 0 <= clip.source_in_ms < clip.source_out_ms <= 1000
    assert result.timeline.duration_ms == end - start


@given(
    first=st.integers(min_value=0, max_value=9),
    second=st.integers(min_value=0, max_value=9),
)
def test_token_deletion_has_exact_duration_and_valid_pieces(first: int, second: int) -> None:
    start, end = sorted((first, second))
    timeline, transcript = _fixture()
    plan = EditPlan.model_validate(
        {
            "project_id": timeline.project_id,
            "expected_revision": timeline.revision,
            "client_request_id": "property-delete-range",
            "operations": [
                {
                    "op": "delete_ranges",
                    "clip_id": "clip_property",
                    "start_token_id": f"tok_{start}",
                    "end_token_id": f"tok_{end}",
                }
            ],
        }
    )
    if start == 0 and end == 9:
        # Empty timelines are rejected atomically by contract.
        from pytest import raises

        with raises(ValidationError, match="empty"):
            reduce_edit_plan(timeline, transcript, plan)
        return
    result = reduce_edit_plan(timeline, transcript, plan)
    validate_timeline_invariants(result.timeline)
    assert result.timeline.duration_ms == 1000 - (end - start + 1) * 100
    assert all(clip.duration_ms > 0 for clip in result.timeline.clips)
