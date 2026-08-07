"""
TTS 服务：参考音频提取和上传
"""
import os
import json
import hashlib
import subprocess

from config import TTS_CACHE_DIR, TTS_SERVICE_URL, TTS_UPLOAD_ENABLED
from legacy_web.services.media_service import build_ffmpeg_concat_filter


def extract_ref_audio(source_path, ref_segments):
    """
    从源文件中提取参考音频片段并拼接为单个 WAV 文件。

    Args:
        source_path: 源音频/视频文件路径
        ref_segments: 参考片段列表 [{"start": ms, "end": ms}, ...]

    Returns:
        提取的参考音频文件路径（WAV 16kHz mono），或 None
    """
    # 生成缓存 key（基于源文件名+片段信息的 hash）
    seg_str = json.dumps(ref_segments, sort_keys=True)
    cache_key = hashlib.md5(f"{source_path}:{seg_str}".encode()).hexdigest()[:16]
    ref_path = os.path.join(TTS_CACHE_DIR, f"ref_{cache_key}.wav")

    # 如果缓存已存在，直接返回
    if os.path.exists(ref_path):
        print(f"[TTS] Using cached ref audio: {ref_path}")
        return ref_path

    # 构建 FFmpeg filter_complex 仅提取音频
    filter_complex, maps = build_ffmpeg_concat_filter(ref_segments, has_video=False)

    cmd = [
        'ffmpeg', '-y',
        '-i', source_path,
        '-filter_complex', filter_complex,
        *maps,
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        ref_path
    ]

    print(f"[TTS] Extracting ref audio from {len(ref_segments)} segments...")
    result = subprocess.run(cmd, capture_output=True, timeout=120)

    if result.returncode != 0:
        error_msg = result.stderr.decode('utf-8', errors='ignore')
        print(f"[TTS] FFmpeg ref extraction error: {error_msg[:500]}")
        return None

    print(f"[TTS] Ref audio saved: {ref_path} ({os.path.getsize(ref_path)} bytes)")
    return ref_path


def upload_ref_audio_to_tts_server(local_ref_path):
    """
    通过 HTTP 将参考音频上传到 TTS 服务器，返回服务器本地路径。

    需要 TTS 服务器部署了 /api/v1/upload-prompt 端点（见 docs/tts_server_patch.py）。
    """
    import requests as http_requests

    if not local_ref_path or not TTS_UPLOAD_ENABLED:
        return None

    try:
        filename = os.path.basename(local_ref_path)
        with open(local_ref_path, 'rb') as f:
            resp = http_requests.post(
                f"{TTS_SERVICE_URL}/api/v1/upload-prompt",
                files={"file": (filename, f, "audio/wav")},
                timeout=30
            )

        if resp.status_code == 200:
            data = resp.json()
            remote_path = data.get('path')
            print(f"[TTS] Uploaded ref audio to TTS server: {remote_path} ({data.get('size')} bytes)")
            return remote_path
        else:
            print(f"[TTS] Upload failed ({resp.status_code}): {resp.text[:200]}")
            return None

    except Exception as e:
        print(f"[TTS] Failed to upload ref audio: {e}")
        return None
