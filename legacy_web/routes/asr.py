"""
ASR 路由：语音识别、健康检查、服务器状态
"""
import os
import json
import uuid
import shutil
import time
import subprocess
from datetime import datetime
from flask import Blueprint, request, jsonify

from config import MATERIALS_DIR, UPLOADS_TEMP_DIR, RESULT_DIR, uploaded_files
from legacy_web.services.asr_service import (
    basic_model, advanced_model,
    basic_model_lock, advanced_model_lock,
    request_counter,
    get_cached_result, save_to_cache,
)
from legacy_web.services.media_service import (
    cleanup_old_uploads,
    extract_audio_from_video,
    is_video_file,
)

asr_bp = Blueprint('asr', __name__)


@asr_bp.route('/asr', methods=['POST'])
def asr():
    extracted_audio_path = None  # 用于记录从视频提取的音频路径
    try:
        # 检查是否使用素材库文件
        material_name = request.form.get('material_name', '').strip()

        if material_name:
            # 使用素材库中的文件
            media_path = os.path.join(MATERIALS_DIR, material_name)
            if not os.path.exists(media_path):
                return jsonify({"error": f"Material not found: {material_name}"}), 404
            original_filename = material_name
            # 素材文件不需要删除
            should_delete_temp = False

            # 检查素材是否为视频文件
            if is_video_file(material_name):
                print(f"检测到视频素材，开始提取音频: {material_name}")
                try:
                    extracted_audio_path = extract_audio_from_video(media_path)
                    audio_path = extracted_audio_path
                except subprocess.CalledProcessError as e:
                    print(f"视频音频提取失败: {e.stderr.decode() if e.stderr else str(e)}")
                    return jsonify({"error": "视频音频提取失败，请确保视频文件包含音轨"}), 500
            else:
                audio_path = media_path
        else:
            # 使用上传的文件
            if 'audio' not in request.files:
                return jsonify({"error": "No audio file provided"}), 400

            file = request.files['audio']
            if file.filename == '':
                return jsonify({"error": "No audio file selected"}), 400

            # 保留原始文件扩展名，用时间戳作为文件名避免冲突
            original_ext = os.path.splitext(file.filename)[1].lower() or '.wav'
            temp_name = f"{int(datetime.now().timestamp()*1000)}{original_ext}"
            media_path = os.path.join("/tmp", temp_name)
            file.save(media_path)
            original_filename = file.filename
            should_delete_temp = True

            # 检查上传文件是否为视频
            if is_video_file(file.filename):
                print(f"检测到上传视频，开始提取音频: {file.filename}")
                try:
                    extracted_audio_path = extract_audio_from_video(media_path)
                    audio_path = extracted_audio_path
                except subprocess.CalledProcessError as e:
                    print(f"视频音频提取失败: {e.stderr.decode() if e.stderr else str(e)}")
                    return jsonify({"error": "视频音频提取失败，请确保视频文件包含音轨"}), 500
            else:
                audio_path = media_path

        enable_advanced = request.form.get('enable_advanced', 'false').lower() in ['true', '1', 'yes', 'on']
        model_type = "advanced" if enable_advanced else "basic"

        # 获取热词参数（提前获取，用于判断是否使用缓存）
        hotwords = request.form.get('hotwords', '').strip()

        # 如果是素材库文件且没有热词，先检查服务器缓存
        if material_name and not hotwords:
            cached_result = get_cached_result(material_name, model_type)
            if cached_result is not None:
                print(f"使用缓存结果: {material_name} ({model_type})")
                cached_result["from_cache"] = True
                return jsonify(cached_result)

        selected_model = advanced_model if enable_advanced else basic_model
        selected_lock = advanced_model_lock if enable_advanced else basic_model_lock

        # 增加等待计数
        request_counter.increment_waiting(enable_advanced)

        # 使用锁保护模型调用，确保线程安全
        print(f"等待模型锁... (模型: {'advanced' if enable_advanced else 'basic'})")
        try:
            with selected_lock:
                request_counter.start_processing(enable_advanced)
                print(f"获得模型锁，开始识别...")

                if hotwords:
                    print(f"Using hotwords: {hotwords}")
                    res = selected_model.generate(input=audio_path, hotword=hotwords)
                else:
                    res = selected_model.generate(input=audio_path)
                print(f"识别完成，释放模型锁")
        finally:
            request_counter.finish_processing(enable_advanced)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename_without_ext = os.path.splitext(original_filename)[0]
        result_filename = f"{filename_without_ext}_{model_type}_{timestamp}.json"
        result_path = os.path.join(RESULT_DIR, result_filename)

        def _to_jsonable(obj):
            try:
                import numpy as np  # noqa
            except Exception:
                np = None
            if isinstance(obj, (str, int, float, bool)) or obj is None:
                return obj
            if isinstance(obj, bytes):
                try:
                    return obj.decode('utf-8')
                except Exception:
                    return obj.decode('latin1', 'ignore')
            if isinstance(obj, dict):
                return { _to_jsonable(k): _to_jsonable(v) for k, v in obj.items() }
            if isinstance(obj, (list, tuple, set)):
                return [ _to_jsonable(x) for x in obj ]
            try:
                import numpy as np
                if isinstance(obj, np.ndarray):
                    return obj.tolist()
                if isinstance(obj, (np.integer, np.floating)):
                    return obj.item()
                if isinstance(obj, (np.bool_)):
                    return bool(obj)
            except Exception:
                pass
            if hasattr(obj, 'tolist'):
                try:
                    return obj.tolist()
                except Exception:
                    pass
            if hasattr(obj, 'item'):
                try:
                    return obj.item()
                except Exception:
                    pass
            return str(obj)

        payload = _to_jsonable(res)
        print("Debug - Model Result Structure:", json.dumps(payload, ensure_ascii=False, indent=2))

        try:
            with open(result_path, 'w', encoding='utf-8') as f:
                json.dump(res, f, ensure_ascii=False, indent=2)
        except TypeError:
            with open(result_path, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)

        # 构造返回体，保持前端兼容
        response_data = None
        if isinstance(payload, dict):
            response_data = payload.copy()
            response_data["model_used"] = model_type
            response_data["result_saved_to"] = result_path
            response_data["hotwords_used"] = hotwords if hotwords else None
        elif isinstance(payload, list):
            first = payload[0] if payload else None
            full_text = first.get('text', '') if isinstance(first, dict) else (str(first) if first is not None else '')

            segments = []
            if len(payload) > 1:
                segments = payload[1:]
            elif isinstance(first, dict):
                if 'sentence_info' in first:
                    segments = first['sentence_info']
                elif 'timestamp' in first:
                    pass

            response_data = {
                "text": full_text,
                "segments": segments,
                "model_used": model_type,
                "result_saved_to": result_path,
                "hotwords_used": hotwords if hotwords else None
            }

        # 如果是素材库文件且没有使用热词，保存到服务器缓存
        if material_name and not hotwords and response_data:
            save_to_cache(material_name, model_type, response_data)

        # 如果是上传文件，保留到临时目录用于后续导出
        file_id = None
        if 'should_delete_temp' in locals() and should_delete_temp:
            if 'media_path' in locals() and os.path.exists(media_path):
                # 清理过期的上传文件
                cleanup_old_uploads()

                # 生成 file_id
                file_id = str(uuid.uuid4())[:12]
                dest_filename = f"{file_id}_{original_filename}"
                dest_path = os.path.join(UPLOADS_TEMP_DIR, dest_filename)

                shutil.move(media_path, dest_path)

                uploaded_files[file_id] = {
                    'path': dest_path,
                    'filename': original_filename,
                    'created_at': time.time()
                }
                print(f"[Upload] Saved file for export: {original_filename} -> {file_id}")

                # 标记文件已移动，不需要在 finally 中删除
                should_delete_temp = False

        # 添加 file_id 到响应（如果有）
        if response_data and file_id:
            response_data["uploaded_file_id"] = file_id

        return jsonify(response_data)

    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        # 清理临时文件
        if extracted_audio_path and os.path.exists(extracted_audio_path):
            os.remove(extracted_audio_path)
        if 'should_delete_temp' in locals() and should_delete_temp:
            if 'media_path' in locals() and os.path.exists(media_path):
                os.remove(media_path)


@asr_bp.route('/health')
def health():
    return jsonify({"status": "healthy", "message": "FunASR service is running"})


@asr_bp.route('/server-status')
def server_status():
    """获取服务器当前状态"""
    return jsonify(request_counter.get_status())
