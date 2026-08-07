from legacy_web.services.media_service import build_ffmpeg_concat_filter, is_video_file


def test_legacy_ffmpeg_concat_filter_contract_is_preserved() -> None:
    segments = [{"start": 1000, "end": 2500}, {"start": 4000, "end": 5000}]
    video_filter, video_maps = build_ffmpeg_concat_filter(segments, has_video=True)
    assert video_filter == ";".join(
        [
            "[0:v]trim=start=1.0:end=2.5,setpts=PTS-STARTPTS[v0]",
            "[0:a]atrim=start=1.0:end=2.5,asetpts=PTS-STARTPTS[a0]",
            "[0:v]trim=start=4.0:end=5.0,setpts=PTS-STARTPTS[v1]",
            "[0:a]atrim=start=4.0:end=5.0,asetpts=PTS-STARTPTS[a1]",
            "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]",
        ]
    )
    assert video_maps == ["-map", "[outv]", "-map", "[outa]"]

    audio_filter, audio_maps = build_ffmpeg_concat_filter(segments, has_video=False)
    assert "[0:v]" not in audio_filter
    assert audio_filter.endswith("[a0][a1]concat=n=2:v=0:a=1[outa]")
    assert audio_maps == ["-map", "[outa]"]
    assert is_video_file("Example.MP4") is True
    assert is_video_file("speech.wav") is False
