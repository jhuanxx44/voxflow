"""ASR provider boundary, lazy FunASR adapter, and deterministic normalization."""

from __future__ import annotations

import math
import re
import subprocess
import tempfile
import threading
import unicodedata
from pathlib import Path
from typing import Any, Literal, Protocol

from voxflow.domain.errors import DependencyError, ValidationError
from voxflow.domain.ids import new_segment_id, new_token_id
from voxflow.domain.models import Transcript, TranscriptSegment, TranscriptToken


class ASRProvider(Protocol):
    def recognize(self, source: Path, *, model: str, hotwords: str = "") -> Any: ...


_TOKEN_PATTERN = re.compile(r"[A-Za-z]+|[0-9]+(?:\.[0-9]+)*|[^\s]")


def _token_type(text: str) -> Literal["word", "number", "char"]:
    if text.isascii() and text.isalpha():
        return "word"
    if text[0].isdigit():
        return "number"
    return "char"


def _is_punctuation(text: str) -> bool:
    return all(unicodedata.category(character).startswith("P") for character in text)


def _raw_segments(payload: Any) -> tuple[str, list[dict[str, Any]]]:
    if isinstance(payload, list):
        if not payload:
            return "", []
        first = payload[0]
        if isinstance(first, dict):
            full_text = str(first.get("text", ""))
            segments = first.get("sentence_info")
            if isinstance(segments, list):
                return full_text, [item for item in segments if isinstance(item, dict)]
            single = _top_level_segment(first)
            if single:
                return full_text, [single]
            return full_text, [item for item in payload[1:] if isinstance(item, dict)]
        return str(first), []
    if isinstance(payload, dict):
        full_text = str(payload.get("full_text") or payload.get("text") or "")
        segments = payload.get("segments") or payload.get("sentence_info") or []
        if not segments:
            single = _top_level_segment(payload)
            if single:
                return full_text, [single]
        return full_text, [item for item in segments if isinstance(item, dict)]
    raise ValidationError("ASR provider returned an unsupported result shape")


def _top_level_segment(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Convert FunASR basic-mode text+timestamp output into one timed segment."""
    timestamps = payload.get("timestamp")
    if not payload.get("text") or not isinstance(timestamps, list) or not timestamps:
        return None
    valid_pairs = [
        item for item in timestamps if isinstance(item, (list, tuple)) and len(item) >= 2
    ]
    if not valid_pairs:
        return None
    segment = dict(payload)
    segment.setdefault("start", int(valid_pairs[0][0]))
    segment.setdefault("end", int(valid_pairs[-1][1]))
    return segment


def normalize_asr_result(
    project_id: str,
    payload: Any,
    *,
    model: str,
    language: str | None = "zh",
) -> Transcript:
    full_text, raw_segments = _raw_segments(payload)
    segments: list[TranscriptSegment] = []
    for ordinal, raw in enumerate(raw_segments):
        text = str(raw.get("text", ""))
        start_ms = int(raw.get("start", 0))
        end_ms = int(raw.get("end", start_ms))
        if end_ms <= start_ms:
            continue
        matches = list(_TOKEN_PATTERN.finditer(text))
        timed_matches = [match for match in matches if not _is_punctuation(match.group())]
        timestamps = raw.get("timestamp") or []
        timestamps_valid = (
            isinstance(timestamps, list)
            and len(timestamps) == len(timed_matches)
            and all(
                isinstance(item, (list, tuple))
                and len(item) >= 2
                and math.isfinite(float(item[0]))
                and math.isfinite(float(item[1]))
                for item in timestamps
            )
        )
        tokens: list[TranscriptToken] = []
        if timestamps_valid:
            timestamp_index = 0
            previous_end = start_ms
            for match in matches:
                token_text = match.group()
                if _is_punctuation(token_text):
                    token_start = previous_end
                    token_end = previous_end
                else:
                    pair = timestamps[timestamp_index]
                    token_start = max(start_ms, int(pair[0]))
                    token_end = min(end_ms, int(pair[1]))
                    previous_end = token_end
                    timestamp_index += 1
                tokens.append(
                    TranscriptToken(
                        id=new_token_id(),
                        text=token_text,
                        start_ms=token_start,
                        end_ms=token_end,
                        type=_token_type(token_text),
                        char_start=match.start(),
                        char_end=match.end(),
                    )
                )
        speaker = raw.get("spk")
        segments.append(
            TranscriptSegment(
                id=new_segment_id(),
                ordinal=ordinal,
                start_ms=start_ms,
                end_ms=end_ms,
                text=text,
                speaker_id=f"spk_{speaker}" if speaker is not None else None,
                tokens=tokens,
                edit_precision="token" if tokens else "segment",
            )
        )
    if not segments:
        raise ValidationError("ASR result contains no valid timed segments")
    return Transcript(
        project_id=project_id,
        full_text=full_text or "".join(segment.text for segment in segments),
        model=model,
        language=language,
        segments=segments,
    )


class FunASRProvider:
    """Local FunASR provider; importing this module never imports Torch/FunASR."""

    _models: dict[str, Any] = {}
    _lock = threading.Lock()

    def __init__(self, *, ffmpeg: str = "ffmpeg") -> None:
        self.ffmpeg = ffmpeg

    def _model(self, variant: str) -> Any:
        key = "advanced" if variant == "advanced" else "basic"
        with self._lock:
            if key in self._models:
                return self._models[key]
            try:
                from funasr import AutoModel
            except ImportError as error:
                raise DependencyError(
                    "FunASR is not installed; install VoxFlow with the asr-local extra"
                ) from error
            model_name = (
                "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-" + "16k-common-vocab8404-pytorch"
            )
            arguments: dict[str, Any] = {
                "model": model_name,
                "trust_remote_code": True,
                "disable_update": True,
            }
            if key == "advanced":
                arguments.update(vad_model="fsmn-vad", punc_model="ct-punc", spk_model="cam++")
            self._models[key] = AutoModel(**arguments)
            return self._models[key]

    def recognize(self, source: Path, *, model: str, hotwords: str = "") -> Any:
        input_path = source
        temporary: Path | None = None
        try:
            if source.suffix.lower() in {
                ".mp4",
                ".mkv",
                ".avi",
                ".mov",
                ".wmv",
                ".flv",
                ".webm",
                ".m4v",
                ".3gp",
            }:
                descriptor, name = tempfile.mkstemp(suffix=".wav", prefix="voxflow-asr-")
                Path(name).unlink(missing_ok=True)
                # ffmpeg creates the output; close the reserved descriptor first.
                import os

                os.close(descriptor)
                temporary = Path(name)
                result = subprocess.run(
                    [
                        self.ffmpeg,
                        "-y",
                        "-i",
                        str(source),
                        "-vn",
                        "-acodec",
                        "pcm_s16le",
                        "-ar",
                        "16000",
                        "-ac",
                        "1",
                        str(temporary),
                    ],
                    capture_output=True,
                    timeout=600,
                    check=False,
                )
                if result.returncode != 0:
                    raise ValidationError("Failed to extract audio from video")
                input_path = temporary
            selected = self._model(model)
            arguments: dict[str, Any] = {"input": str(input_path)}
            if hotwords:
                arguments["hotword"] = hotwords
            return selected.generate(**arguments)
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)
