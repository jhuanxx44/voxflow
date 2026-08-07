"""
媒体导出路由：编辑后音视频导出和下载
"""
import os
import uuid
import time
import subprocess
import traceback
from flask import Blueprint, request, jsonify, send_file

from config import (
    MATERIALS_DIR, EXPORT_TEMP_DIR,
    uploaded_files, export_tasks, export_semaphore,
)
from legacy_web.services.media_service import (
    is_video_file, build_ffmpeg_concat_filter,
    cleanup_old_exports,
)

media_bp = Blueprint('media', __name__)


@media_bp.route('/export-media', methods=['POST'])
def export_media():
    """
    导出编辑后的媒体文件

    请求体 JSON:
    {
        "segments": [{"start": 1000, "end": 3500, "text": "..."}],
        "source": {"type": "material", "name": "example.mp4"},
        "output_format": "mp4" | "mp3" | "wav"
    }
    """
    acquired = export_semaphore.acquire(timeout=30)
    if not acquired:
        return jsonify({
            "error": "服务器繁忙，请稍后重试",
            "retry_after": 30
        }), 503

    try:
        cleanup_old_exports()

        data = request.get_json()

        segments = data.get('segments', [])
        source = data.get('source', {})
        output_format = data.get('output_format', 'mp4')

        if not segments:
            return jsonify({"error": "No segments provided"}), 400

        if output_format not in ['mp4', 'mp3', 'wav']:
            return jsonify({"error": f"Unsupported output format: {output_format}"}), 400

        # 获取源文件路径
        source_type = source.get('type')
        source_name = source.get('name')
        source_file_id = source.get('file_id')

        if source_type == 'material':
            input_path = os.path.join(MATERIALS_DIR, source_name)
            if not os.path.exists(input_path):
                return jsonify({"error": f"Material not found: {source_name}"}), 404
        elif source_type == 'upload' and source_file_id:
            file_info = uploaded_files.get(source_file_id)
            if not file_info:
                return jsonify({"error": "Uploaded file not found or expired. Please re-upload and recognize again."}), 404
            input_path = file_info['path']
            if not os.path.exists(input_path):
                del uploaded_files[source_file_id]
                return jsonify({"error": "Uploaded file no longer exists. Please re-upload and recognize again."}), 404
            source_name = file_info['filename']
        else:
            return jsonify({"error": "Invalid source. Provide material name or upload file_id."}), 400

        is_video = is_video_file(source_name)
        has_video = is_video and output_format == 'mp4'

        task_id = str(uuid.uuid4())[:8]
        base_name = os.path.splitext(source_name)[0]
        output_filename = f"{base_name}_edited_{task_id}.{output_format}"
        output_path = os.path.join(EXPORT_TEMP_DIR, output_filename)

        filter_complex, maps = build_ffmpeg_concat_filter(segments, has_video)

        # FFmpeg 编码参数
        if output_format == 'mp4':
            encode_params = [
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'aac', '-b:a', '128k'
            ]
        elif output_format == 'mp3':
            encode_params = ['-c:a', 'libmp3lame', '-b:a', '192k']
        elif output_format == 'wav':
            encode_params = ['-c:a', 'pcm_s16le', '-ar', '44100']
        else:
            encode_params = []

        cmd = [
            'ffmpeg', '-y',
            '-i', input_path,
            '-filter_complex', filter_complex,
            *maps,
            *encode_params,
            output_path
        ]

        print(f"[Export] Running FFmpeg command...")
        print(f"[Export] Input: {input_path}")
        print(f"[Export] Output: {output_path}")
        print(f"[Export] Segments count: {len(segments)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=600
        )

        if result.returncode != 0:
            error_msg = result.stderr.decode('utf-8', errors='ignore')
            print(f"[Export] FFmpeg error: {error_msg}")
            return jsonify({"error": f"FFmpeg processing failed: {error_msg[:500]}"}), 500

        if not os.path.exists(output_path):
            return jsonify({"error": "Output file was not created"}), 500

        file_size = os.path.getsize(output_path)
        print(f"[Export] Success! Output file size: {file_size} bytes")

        # 小文件（<50MB）直接返回
        if file_size < 50 * 1024 * 1024:
            if output_format == 'mp4':
                mimetype = 'video/mp4'
            elif output_format == 'mp3':
                mimetype = 'audio/mpeg'
            elif output_format == 'wav':
                mimetype = 'audio/wav'
            else:
                mimetype = 'application/octet-stream'

            response = send_file(
                output_path,
                mimetype=mimetype,
                as_attachment=True,
                download_name=output_filename
            )

            @response.call_on_close
            def cleanup():
                if os.path.exists(output_path):
                    os.remove(output_path)
                    print(f"[Export] Cleaned up: {output_filename}")

            return response
        else:
            # 大文件：存储并返回下载链接
            export_tasks[task_id] = {
                'path': output_path,
                'filename': output_filename,
                'created_at': time.time(),
                'has_video': has_video,
                'format': output_format
            }

            return jsonify({
                "status": "ready",
                "download_url": f"/export-download/{task_id}",
                "filename": output_filename,
                "size": file_size,
                "expires_in": 3600
            })

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Export timeout (>10 minutes). Please try with fewer segments."}), 504
    except Exception as e:
        print(f"[Export] Error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        export_semaphore.release()


@media_bp.route('/export-download/<task_id>', methods=['GET'])
def export_download(task_id):
    """下载已导出的大文件"""
    task = export_tasks.get(task_id)

    if not task:
        return jsonify({"error": "Export not found or expired"}), 404

    output_path = task['path']

    if not os.path.exists(output_path):
        del export_tasks[task_id]
        return jsonify({"error": "Export file no longer exists"}), 404

    # 检查是否过期（1小时）
    if time.time() - task['created_at'] > 3600:
        if os.path.exists(output_path):
            os.remove(output_path)
        del export_tasks[task_id]
        return jsonify({"error": "Export expired"}), 410

    fmt = task['format']
    if fmt == 'mp4':
        mimetype = 'video/mp4'
    elif fmt == 'mp3':
        mimetype = 'audio/mpeg'
    elif fmt == 'wav':
        mimetype = 'audio/wav'
    else:
        mimetype = 'application/octet-stream'

    return send_file(
        output_path,
        mimetype=mimetype,
        as_attachment=True,
        download_name=task['filename']
    )
