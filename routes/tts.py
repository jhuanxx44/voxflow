"""
TTS 代理路由：调用 IndexTTS 服务进行语音合成
"""
import os
import time
import traceback
import requests as http_requests
from flask import Blueprint, request, jsonify, Response

from config import (
    MATERIALS_DIR, TTS_SERVICE_URL, TTS_DEFAULT_PROMPT_AUDIO,
    uploaded_files, tts_semaphore,
)
from services.tts_service import extract_ref_audio, upload_ref_audio_to_tts_server

tts_bp = Blueprint('tts', __name__)


@tts_bp.route('/tts', methods=['POST'])
def tts():
    """
    TTS 代理接口 - 调用 IndexTTS 服务进行语音合成（支持声音克隆）

    请求体 JSON:
    {
        "text": "要合成的文本",
        "source": {"type": "material", "name": "xxx.mp4"}
                或 {"type": "upload", "file_id": "abc123"},
        "ref_segments": [{"start": 5000, "end": 12000}, ...],
        "prompt_audio": "可选，直接指定 TTS 服务器上的参考音频路径"
    }

    返回: audio/wav blob
    """
    acquired = tts_semaphore.acquire(timeout=30)
    if not acquired:
        return jsonify({
            "error": "TTS 服务繁忙，请稍后重试",
            "retry_after": 30
        }), 503

    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        source = data.get('source', {})
        ref_segments = data.get('ref_segments', [])
        explicit_prompt_audio = data.get('prompt_audio', '')

        if not text:
            return jsonify({"error": "No text provided"}), 400

        # 确定参考音频路径
        prompt_audio = TTS_DEFAULT_PROMPT_AUDIO
        use_voice_clone = False

        if explicit_prompt_audio:
            prompt_audio = explicit_prompt_audio
            use_voice_clone = True
        elif ref_segments:
            source_path = None
            source_type = source.get('type')

            if source_type == 'material':
                source_name = source.get('name', '')
                source_path = os.path.join(MATERIALS_DIR, source_name)
                if not os.path.exists(source_path):
                    source_path = None
            elif source_type == 'upload':
                file_id = source.get('file_id', '')
                file_info = uploaded_files.get(file_id)
                if file_info and os.path.exists(file_info['path']):
                    source_path = file_info['path']

            if source_path:
                local_ref_path = extract_ref_audio(source_path, ref_segments)
                if local_ref_path:
                    remote_path = upload_ref_audio_to_tts_server(local_ref_path)
                    if remote_path:
                        prompt_audio = remote_path
                        use_voice_clone = True
                    else:
                        print(f"[TTS] Upload not available, using default voice")

        print(f"[TTS] text='{text[:50]}...', prompt_audio={prompt_audio}, voice_clone={use_voice_clone}")

        # 构建 IndexTTS 请求 — 使用同步模式直接返回音频
        tts_payload = {
            "text": text,
            "prompt_audio": prompt_audio,
            "return_audio": True,
        }

        resp = http_requests.post(
            f"{TTS_SERVICE_URL}/api/v1/tts/tasks",
            json=tts_payload,
            timeout=120
        )

        # 同步模式：直接返回音频
        content_type = resp.headers.get('Content-Type', '')
        if 'audio' in content_type and resp.status_code == 200:
            return Response(
                resp.content,
                mimetype='audio/wav',
                headers={
                    'Content-Disposition': 'inline; filename="tts_output.wav"',
                    'X-TTS-Voice-Clone': 'true' if use_voice_clone else 'false',
                }
            )

        # 如果同步模式失败或返回了 JSON（异步任务）
        if resp.status_code == 400:
            error_data = resp.json()
            detail = error_data.get('detail', 'Unknown error')
            # 如果参考音频不存在，回退到默认音色重试
            if 'does not exist' in str(detail) and prompt_audio != TTS_DEFAULT_PROMPT_AUDIO:
                print(f"[TTS] Prompt audio not found on server, retrying with default voice")
                tts_payload["prompt_audio"] = TTS_DEFAULT_PROMPT_AUDIO
                resp = http_requests.post(
                    f"{TTS_SERVICE_URL}/api/v1/tts/tasks",
                    json=tts_payload,
                    timeout=120
                )
                content_type = resp.headers.get('Content-Type', '')
                if 'audio' in content_type and resp.status_code == 200:
                    return Response(
                        resp.content,
                        mimetype='audio/wav',
                        headers={
                            'Content-Disposition': 'inline; filename="tts_output.wav"',
                            'X-TTS-Voice-Clone': 'false',
                        }
                    )

        if resp.status_code != 200:
            error_text = resp.text[:500]
            print(f"[TTS] Service error ({resp.status_code}): {error_text}")
            return jsonify({"error": f"TTS service error: {error_text}"}), 502

        # 异步模式回退：轮询任务状态
        result = resp.json()
        task_id = result.get('task_id')
        if not task_id:
            return jsonify({"error": "No task_id in response"}), 502

        print(f"[TTS] Async mode, polling task: {task_id}")
        for _ in range(120):
            time.sleep(1)
            poll_resp = http_requests.get(
                f"{TTS_SERVICE_URL}/api/v1/tts/tasks/{task_id}",
                timeout=10
            )
            if poll_resp.status_code != 200:
                continue

            poll_data = poll_resp.json()
            status = poll_data.get('status', '')

            if status == 'completed':
                audio_resp = http_requests.get(
                    f"{TTS_SERVICE_URL}/api/v1/tts/tasks/{task_id}/result",
                    timeout=30
                )
                if audio_resp.status_code == 200:
                    return Response(
                        audio_resp.content,
                        mimetype='audio/wav',
                        headers={
                            'Content-Disposition': 'inline; filename="tts_output.wav"',
                            'X-TTS-Voice-Clone': 'true' if use_voice_clone else 'false',
                        }
                    )
                return jsonify({"error": "Failed to download TTS result"}), 502

            elif status == 'failed':
                error_msg = poll_data.get('message', 'Unknown error')
                return jsonify({"error": f"TTS generation failed: {error_msg}"}), 500

        return jsonify({"error": "TTS generation timed out"}), 504

    except Exception as e:
        print(f"[TTS] Error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        tts_semaphore.release()
