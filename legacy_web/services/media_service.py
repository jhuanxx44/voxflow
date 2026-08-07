"""
媒体服务：FFmpeg 相关操作（音频提取、拼接、清理）
"""
import os
import time
import subprocess
from datetime import datetime
from config import (
    VIDEO_EXTENSIONS, EXPORT_TEMP_DIR, UPLOADS_TEMP_DIR,
    UPLOAD_FILE_TTL, uploaded_files,
)


def is_video_file(filename: str) -> bool:
    """检查文件是否为视频文件"""
    ext = os.path.splitext(filename)[1].lower()
    return ext in VIDEO_EXTENSIONS


def extract_audio_from_video(video_path: str) -> str:
    """
    使用 ffmpeg 从视频中提取音频（16kHz 单声道 WAV）

    Args:
        video_path: 视频文件路径

    Returns:
        提取的音频文件路径（始终在 /tmp 目录下）

    Raises:
        subprocess.CalledProcessError: ffmpeg 执行失败时抛出
    """
    video_basename = os.path.basename(video_path)
    audio_filename = f"{int(datetime.now().timestamp()*1000)}_{video_basename.rsplit('.', 1)[0]}_extracted.wav"
    audio_path = os.path.join("/tmp", audio_filename)

    cmd = [
        'ffmpeg', '-y',           # 覆盖已存在的文件
        '-i', video_path,         # 输入视频
        '-vn',                    # 不处理视频流
        '-acodec', 'pcm_s16le',   # PCM 16-bit 编码
        '-ar', '16000',           # 采样率 16kHz（FunASR 要求）
        '-ac', '1',               # 单声道
        audio_path
    ]
    subprocess.run(cmd, check=True, capture_output=True, timeout=300)
    return audio_path


def build_ffmpeg_concat_filter(segments, has_video=True):
    """
    构建 FFmpeg filter_complex 字符串，用于精确切割和拼接音视频

    Args:
        segments: 片段列表 [{"start": ms, "end": ms}, ...]
        has_video: 是否包含视频流

    Returns:
        (filter_complex 字符串, map 参数列表)
    """
    filters = []
    video_labels = []
    audio_labels = []

    for i, seg in enumerate(segments):
        start_sec = seg['start'] / 1000
        end_sec = seg['end'] / 1000

        if has_video:
            filters.append(
                f"[0:v]trim=start={start_sec}:end={end_sec},setpts=PTS-STARTPTS[v{i}]"
            )
            video_labels.append(f"[v{i}]")

        filters.append(
            f"[0:a]atrim=start={start_sec}:end={end_sec},asetpts=PTS-STARTPTS[a{i}]"
        )
        audio_labels.append(f"[a{i}]")

    n = len(segments)
    if has_video:
        concat_inputs = ''.join(f"[v{i}][a{i}]" for i in range(n))
        filters.append(f"{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]")
        maps = ['-map', '[outv]', '-map', '[outa]']
    else:
        concat_inputs = ''.join(audio_labels)
        filters.append(f"{concat_inputs}concat=n={n}:v=0:a=1[outa]")
        maps = ['-map', '[outa]']

    return ';'.join(filters), maps


def cleanup_old_exports():
    """清理超过 1 小时的导出文件"""
    cutoff = time.time() - 3600
    try:
        for filename in os.listdir(EXPORT_TEMP_DIR):
            filepath = os.path.join(EXPORT_TEMP_DIR, filename)
            if os.path.isfile(filepath) and os.path.getmtime(filepath) < cutoff:
                os.remove(filepath)
                print(f"[Export] Cleaned up old export: {filename}")
    except Exception as e:
        print(f"[Export] Cleanup error: {str(e)}")


def cleanup_old_uploads():
    """清理超过 8 小时的上传文件"""
    cutoff = time.time() - UPLOAD_FILE_TTL

    # 清理内存中的记录和对应文件
    expired_ids = []
    for file_id, info in uploaded_files.items():
        if info['created_at'] < cutoff:
            expired_ids.append(file_id)
            if os.path.exists(info['path']):
                os.remove(info['path'])
                print(f"[Upload] Cleaned up expired file: {info['filename']}")

    for file_id in expired_ids:
        del uploaded_files[file_id]

    # 清理目录中可能遗漏的文件
    try:
        for filename in os.listdir(UPLOADS_TEMP_DIR):
            filepath = os.path.join(UPLOADS_TEMP_DIR, filename)
            if os.path.isfile(filepath) and os.path.getmtime(filepath) < cutoff:
                os.remove(filepath)
                print(f"[Upload] Cleaned up orphan file: {filename}")
    except Exception as e:
        print(f"[Upload] Cleanup error: {str(e)}")
