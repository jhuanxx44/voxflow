from __future__ import annotations

from pathlib import Path

import pytest

from voxflow.domain.errors import ValidationError
from voxflow.domain.models import TimelineClip, TimelineRevision
from voxflow.infrastructure.renderer import build_ffmpeg_args, compile_render_plan, render_subtitles


def _timeline(ranges: list[tuple[int, int]]) -> TimelineRevision:
    return TimelineRevision(
        project_id="prj_renderer",
        revision=1,
        clips=[
            TimelineClip(
                id=f"clip_{index}",
                source_segment_id=f"seg_{index}",
                source_in_ms=start,
                source_out_ms=end,
                transcript_text=str(index),
            )
            for index, (start, end) in enumerate(ranges)
        ],
    )


def _compile(ranges: list[tuple[int, int]], *, has_video: bool = False, has_audio: bool = True):
    return compile_render_plan(
        "prj_renderer",
        _timeline(ranges),
        source_path=Path("/tmp/source.mp4"),
        source_has_video=has_video,
        source_has_audio=has_audio,
        output_format="mp4" if has_video else "wav",
    )


def test_empty_timeline_is_rejected_by_compiler() -> None:
    with pytest.raises(ValidationError, match="empty timeline"):
        _compile([])


def test_adjacent_ranges_coalesce_and_extremely_short_clip_is_preserved() -> None:
    plan = _compile([(0, 1), (1, 2), (10, 11)])
    assert [(item.source_in_ms, item.source_out_ms) for item in plan.ranges] == [
        (0, 2),
        (10, 11),
    ]
    assert plan.duration_ms == 3


def test_large_timeline_compiles_without_truncation() -> None:
    ranges = [(index * 2, index * 2 + 1) for index in range(1000)]
    plan = _compile(ranges)
    assert len(plan.ranges) == 1000
    assert plan.duration_ms == 1000


def test_video_only_ffmpeg_graph_never_references_audio_stream() -> None:
    plan = _compile([(0, 500), (1000, 1500)], has_video=True, has_audio=False)
    args = build_ffmpeg_args(plan, Path("/tmp/output.mp4"))
    graph = args[args.index("-filter_complex") + 1]
    assert "[0:a]" not in graph
    assert "a=0" in graph
    assert "[outv]" in args


def test_subtitle_timestamps_follow_edited_order_without_source_gaps() -> None:
    timeline = _timeline([(4000, 5000), (1000, 2500)])
    timeline.clips[0].transcript_text = "后段先播"
    timeline.clips[1].transcript_text = "前段后播"
    srt = render_subtitles(timeline, vtt=False)
    vtt = render_subtitles(timeline, vtt=True)
    assert "00:00:00,000 --> 00:00:01,000\n后段先播" in srt
    assert "00:00:01,000 --> 00:00:02,500\n前段后播" in srt
    assert vtt.startswith("WEBVTT\n\n")
    assert "00:00:01.000 --> 00:00:02.500\n前段后播" in vtt
