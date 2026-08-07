from voxflow.infrastructure.asr import normalize_asr_result


def test_normalize_funasr_sentence_info_with_stable_ids() -> None:
    payload = [
        {
            "text": "你好。",
            "sentence_info": [
                {
                    "text": "你好。",
                    "start": 0,
                    "end": 800,
                    "timestamp": [[0, 300], [300, 700]],
                    "spk": 0,
                }
            ],
        }
    ]
    transcript = normalize_asr_result("prj_test", payload, model="advanced")
    segment = transcript.segments[0]
    assert segment.edit_precision == "token"
    assert [token.text for token in segment.tokens] == ["你", "好", "。"]
    assert segment.speaker_id == "spk_0"
    assert segment.tokens[0].id.startswith("tok_")


def test_missing_timestamps_degrades_to_segment_precision() -> None:
    payload = [
        {
            "text": "测试",
            "sentence_info": [{"text": "测试", "start": 0, "end": 500, "spk": 0}],
        }
    ]
    transcript = normalize_asr_result("prj_test", payload, model="basic")
    assert transcript.segments[0].edit_precision == "segment"
    assert transcript.segments[0].tokens == []


def test_basic_top_level_text_and_timestamps_become_one_segment() -> None:
    payload = [
        {
            "key": "fixture",
            "text": "你好",
            "timestamp": [[0, 200], [200, 500]],
        }
    ]
    transcript = normalize_asr_result("prj_test", payload, model="basic")
    segment = transcript.segments[0]
    assert (segment.start_ms, segment.end_ms) == (0, 500)
    assert [token.text for token in segment.tokens] == ["你", "好"]
    assert segment.edit_precision == "token"
