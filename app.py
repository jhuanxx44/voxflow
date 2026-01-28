from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
from funasr import AutoModel
from werkzeug.utils import secure_filename
import os
import json
from datetime import datetime
import threading
import openai
import subprocess

app = Flask(__name__)
CORS(app)  # 启用 CORS，支持跨域请求

# 设置最大上传文件大小为 50MB
app.config['MAX_CONTENT_LENGTH'] = 300 * 1024 * 1024

# 初始化基础模型（支持热词）
basic_model = AutoModel(
    model="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
    trust_remote_code=True,
    disable_update=True
)

# 初始化带 VAD、标点、说话人识别的完整模型（支持热词+时间戳+说话人）
advanced_model = AutoModel(
    model="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
    vad_model="fsmn-vad",
    punc_model="ct-punc",
    spk_model="cam++",
    trust_remote_code=True,
    disable_update=True
)

# 创建线程锁，保护模型调用
basic_model_lock = threading.Lock()
advanced_model_lock = threading.Lock()

# 请求计数器（用于显示服务器状态）
class RequestCounter:
    def __init__(self):
        self.lock = threading.Lock()
        self.basic_processing = 0
        self.basic_waiting = 0
        self.advanced_processing = 0
        self.advanced_waiting = 0

    def get_status(self):
        with self.lock:
            return {
                "basic": {
                    "processing": self.basic_processing,
                    "waiting": self.basic_waiting
                },
                "advanced": {
                    "processing": self.advanced_processing,
                    "waiting": self.advanced_waiting
                },
                "total_active": self.basic_processing + self.advanced_processing + self.basic_waiting + self.advanced_waiting
            }

    def increment_waiting(self, is_advanced):
        with self.lock:
            if is_advanced:
                self.advanced_waiting += 1
            else:
                self.basic_waiting += 1

    def start_processing(self, is_advanced):
        with self.lock:
            if is_advanced:
                self.advanced_waiting -= 1
                self.advanced_processing += 1
            else:
                self.basic_waiting -= 1
                self.basic_processing += 1

    def finish_processing(self, is_advanced):
        with self.lock:
            if is_advanced:
                self.advanced_processing -= 1
            else:
                self.basic_processing -= 1

request_counter = RequestCounter()

result_dir = "result"
if not os.path.exists(result_dir):
    os.makedirs(result_dir)

STATIC_DIR = "static"
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

# 素材库目录
MATERIALS_DIR = os.path.expanduser("~/funasr_server/materials")
if not os.path.exists(MATERIALS_DIR):
    os.makedirs(MATERIALS_DIR)

# 服务器端缓存目录（用于素材库文件）
CACHE_DIR = os.path.expanduser("~/funasr_server/cache")
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

# 管理员密码
ADMIN_PASSWORD = "***REMOVED***"

# 视频文件扩展名
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'}

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
    # 始终将提取的音频放在 /tmp 目录，避免污染素材库
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

# 服务器端缓存辅助函数
def get_cache_key(material_name, model_type):
    """生成缓存键，格式: 素材名_模型类型.json"""
    # 注意：热词不影响缓存键
    filename_without_ext = os.path.splitext(material_name)[0]
    return f"{filename_without_ext}_{model_type}.json"

def get_cached_result(material_name, model_type):
    """从服务器缓存中获取结果"""
    cache_key = get_cache_key(material_name, model_type)
    cache_path = os.path.join(CACHE_DIR, cache_key)

    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                result = json.load(f)
            print(f"从缓存加载结果: {cache_key}")
            return result
        except Exception as e:
            print(f"读取缓存失败: {str(e)}")
            return None
    return None

def save_to_cache(material_name, model_type, result):
    """将结果保存到服务器缓存"""
    cache_key = get_cache_key(material_name, model_type)
    cache_path = os.path.join(CACHE_DIR, cache_key)

    try:
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"结果已保存到缓存: {cache_key}")
    except Exception as e:
        print(f"保存缓存失败: {str(e)}")

@app.route('/')
def index():
    try:
        return send_file(os.path.join(STATIC_DIR, 'index.html'))
    except FileNotFoundError:
        return (
            """
            <h1>FunASR 语音识别服务</h1>
            <p>服务运行正常！</p>
            <p>请将你的前端页面放在 <code>static/</code> 目录下，命名为 <code>index.html</code></p>
            <p>API 端点: <code>/asr</code></p>
            """
        )

@app.route('/asr', methods=['POST'])
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
        # 注意：有热词时不使用缓存，因为热词会影响识别结果
        if material_name and not hotwords:
            cached_result = get_cached_result(material_name, model_type)
            if cached_result is not None:
                # 从缓存返回结果
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
                # 开始处理，更新计数器
                request_counter.start_processing(enable_advanced)
                print(f"获得模型锁，开始识别...")

                # 根据是否有热词调用不同的 generate 方法
                if hotwords:
                    print(f"Using hotwords: {hotwords}")
                    res = selected_model.generate(input=audio_path, hotword=hotwords)
                else:
                    res = selected_model.generate(input=audio_path)
                print(f"识别完成，释放模型锁")
        finally:
            # 完成处理，更新计数器
            request_counter.finish_processing(enable_advanced)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename_without_ext = os.path.splitext(original_filename)[0]
        result_filename = f"{filename_without_ext}_{model_type}_{timestamp}.json"
        result_path = os.path.join(result_dir, result_filename)

        
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
        # debug 打印模型结果结构
        print("Debug - Model Result Structure:", json.dumps(payload, ensure_ascii=False, indent=2)) # 新增这一行用于调试

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

            # 获取全文
            full_text = first.get('text', '') if isinstance(first, dict) else (str(first) if first is not None else '')

            # --- 修复核心逻辑开始 ---
            segments = []
            if len(payload) > 1:
                # 情况 A: 如果数据确实是你预想的扁平列表 [全, 分段1, 分段2...]
                segments = payload[1:]
            elif isinstance(first, dict):
                # 情况 B (最常见): FunASR 返回 [{text:..., sentence_info: [...]}]
                # 带有 spk_model 的高级模式通常将分段信息放在 'sentence_info' 字段中
                if 'sentence_info' in first:
                    segments = first['sentence_info']
                elif 'timestamp' in first:
                    # 如果只有 timestamp，可能需要根据 timestamp 构造 segments (简单兼容)
                    # 这里视具体情况而定，通常 sentence_info 包含文本和时间
                    pass
            # --- 修复核心逻辑结束 ---

            response_data = {
                "text": full_text,
                "segments": segments,
                "model_used": model_type,
                "result_saved_to": result_path,
                "hotwords_used": hotwords if hotwords else None
            }

        # 如果是素材库文件且没有使用热词，保存到服务器缓存
        # 注意：有热词时不保存缓存，因为热词会影响识别结果
        if material_name and not hotwords and response_data:
            save_to_cache(material_name, model_type, response_data)

        return jsonify(response_data)

    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        # 清理临时文件
        # 1. 删除从视频提取的音频文件
        if extracted_audio_path and os.path.exists(extracted_audio_path):
            os.remove(extracted_audio_path)
        # 2. 只删除临时上传的文件，不删除素材库中的文件
        if 'should_delete_temp' in locals() and should_delete_temp:
            if 'media_path' in locals() and os.path.exists(media_path):
                os.remove(media_path)

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "message": "FunASR service is running"})

@app.route('/server-status')
def server_status():
    """获取服务器当前状态"""
    return jsonify(request_counter.get_status())

# ====== 素材库相关接口 ======

@app.route('/materials', methods=['GET'])
def get_materials():
    """获取素材库列表"""
    try:
        materials = []
        for filename in os.listdir(MATERIALS_DIR):
            filepath = os.path.join(MATERIALS_DIR, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                materials.append({
                    "name": filename,
                    "size": stat.st_size,
                    "uploaded_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                })
        # 按上传时间降序排列
        materials.sort(key=lambda x: x['uploaded_at'], reverse=True)
        return jsonify({"materials": materials})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/materials/<path:filename>', methods=['GET'])
def download_material(filename):
    """下载素材文件"""
    try:
        print(f"=== 下载素材请求 ===")
        print(f"请求的文件名: {filename}")
        print(f"文件名类型: {type(filename)}")
        print(f"MATERIALS_DIR: {MATERIALS_DIR}")
        print(f"当前工作目录: {os.getcwd()}")

        # 确保 materials 目录存在
        if not os.path.exists(MATERIALS_DIR):
            print(f"材料目录不存在，创建目录: {MATERIALS_DIR}")
            os.makedirs(MATERIALS_DIR)
            return jsonify({"error": "Materials directory was empty"}), 404

        # 列出目录内容
        files_in_dir = os.listdir(MATERIALS_DIR) if os.path.exists(MATERIALS_DIR) else []
        print(f"目录内容: {files_in_dir}")

        # 构建完整路径（使用绝对路径）
        filepath = os.path.abspath(os.path.join(MATERIALS_DIR, filename))
        print(f"完整文件路径: {filepath}")
        print(f"文件是否存在: {os.path.exists(filepath)}")

        # 如果文件不存在，尝试不区分大小写匹配
        if not os.path.exists(filepath):
            print(f"文件不存在，尝试不区分大小写匹配...")
            for f in files_in_dir:
                if f.lower() == filename.lower():
                    print(f"找到匹配文件（忽略大小写）: {f}")
                    filepath = os.path.abspath(os.path.join(MATERIALS_DIR, f))
                    break

        if not os.path.exists(filepath):
            return jsonify({
                "error": "Material not found",
                "requested": filename,
                "available": files_in_dir
            }), 404

        print(f"发送文件: {filepath}")
        # 根据文件扩展名确定 mimetype
        import mimetypes
        mimetype = mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
        print(f"MIME类型: {mimetype}")

        return send_file(filepath, mimetype=mimetype)
    except Exception as e:
        print(f"Error downloading material: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/admin/upload', methods=['POST'])
def admin_upload():
    """管理员上传素材"""
    try:
        # 验证密码
        password = request.form.get('password', '')
        if password != ADMIN_PASSWORD:
            return jsonify({"error": "Invalid admin password"}), 403

        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # 保存文件，保留中文文件名
        # 只移除路径分隔符等危险字符，保留中文
        original_name = file.filename
        # 移除路径分隔符和其他危险字符
        safe_name = original_name.replace('/', '_').replace('\\', '_').replace('..', '_')
        filepath = os.path.join(MATERIALS_DIR, safe_name)

        # 如果文件已存在，添加时间戳避免覆盖
        if os.path.exists(filepath):
            name, ext = os.path.splitext(safe_name)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = f"{name}_{timestamp}{ext}"
            filepath = os.path.join(MATERIALS_DIR, safe_name)

        file.save(filepath)

        return jsonify({
            "success": True,
            "filename": safe_name,
            "message": "Material uploaded successfully"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/admin/delete/<path:filename>', methods=['DELETE'])
def admin_delete(filename):
    """管理员删除素材"""
    try:
        # 验证密码
        password = request.json.get('password', '') if request.json else ''
        if password != ADMIN_PASSWORD:
            return jsonify({"error": "Invalid admin password"}), 403

        # Don't use secure_filename - use original name from list
        filepath = os.path.join(MATERIALS_DIR, filename)

        print(f"尝试删除文件: {filepath}")
        print(f"文件是否存在: {os.path.exists(filepath)}")

        if not os.path.exists(filepath):
            print(f"目录内容: {os.listdir(MATERIALS_DIR)}")
            return jsonify({"error": "Material not found"}), 404

        os.remove(filepath)
        print(f"文件已删除: {filepath}")

        return jsonify({
            "success": True,
            "message": "Material deleted successfully"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ====== LLM 对话接口 ======

LLM_API_KEY = "***REMOVED***"
LLM_BASE_URL = "http://llmapi.bilibili.co/v1"

# 图像生成使用不同的 API key（bsk- 前缀有图像模型权限）
IMAGE_API_KEY = "***REMOVED***"

llm_client = openai.OpenAI(
    base_url=LLM_BASE_URL,
    api_key=LLM_API_KEY,
)

# 图像生成客户端
image_client = openai.OpenAI(
    base_url=LLM_BASE_URL,
    api_key=IMAGE_API_KEY,
)

@app.route('/chat', methods=['POST'])
def chat():
    """LLM 对话接口，支持流式返回"""
    try:
        data = request.get_json()
        messages = data.get('messages', [])
        stream = data.get('stream', True)

        if not messages:
            return jsonify({"error": "No messages provided"}), 400

        # 添加系统提示
        if not any(m.get('role') == 'system' for m in messages):
            messages.insert(0, {"role": "system", "content": "你是一个有帮助的助手。"})

        if stream:
            # 流式响应
            def generate():
                try:
                    response = llm_client.chat.completions.create(
                        model="deepseek-r1",
                        messages=messages,
                        stream=True
                    )
                    for chunk in response:
                        if chunk.choices[0].delta.content:
                            yield f"data: {json.dumps({'content': chunk.choices[0].delta.content}, ensure_ascii=False)}\n\n"
                        # 如果有 reasoning_content（思考过程），也可以返回
                        if hasattr(chunk.choices[0].delta, 'reasoning_content') and chunk.choices[0].delta.reasoning_content:
                            yield f"data: {json.dumps({'reasoning': chunk.choices[0].delta.reasoning_content}, ensure_ascii=False)}\n\n"
                except Exception as e:
                    print(f"Stream error: {str(e)}")
                    yield f"data: {json.dumps({'content': f'[错误: {str(e)}]'}, ensure_ascii=False)}\n\n"
                finally:
                    # 确保总是发送 [DONE] 信号
                    yield "data: [DONE]\n\n"

            return Response(generate(), mimetype='text/event-stream')
        else:
            # 非流式响应
            response = llm_client.chat.completions.create(
                model="deepseek-r1",
                messages=messages
            )
            result = {
                "content": response.choices[0].message.content,
            }
            # 如果有思考过程
            if hasattr(response.choices[0].message, 'reasoning_content'):
                result["reasoning"] = response.choices[0].message.reasoning_content
            return jsonify(result)

    except Exception as e:
        print(f"Chat error: {str(e)}")
        return jsonify({"error": str(e)}), 500

# ====== 封面生成接口 ======

# 封面风格提示词映射
COVER_STYLE_PROMPTS = {
    '日式动画': 'Japanese Anime style, cel shaded, vibrant colors, Studio Ghibli inspired, high quality, 2D animation',
    '3D 动画': '3D Animation style, Pixar style, Disney style, cgsociety, 3d render, unreal engine 5, cute, vibrant, high detail',
    '像素风格': 'Pixel art style, 16-bit, retro game style, sprite art, nostalgic',
    '吉卜力': 'Studio Ghibli style, watercolor background, hand drawn animation, hayao miyazaki style, scenic, beautiful, dreamy',
    '美式漫画': 'American Comic Book style, marvel style, dc style, bold lines, dynamic shading, comic strip, heroic'
}

@app.route('/generate-cover', methods=['POST'])
def generate_cover():
    """生成视频封面图片 (使用 nano-banana-pro，需要 bsk- API key)"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        style = data.get('style', '日式动画')

        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400

        # 获取风格提示词
        style_prompt = COVER_STYLE_PROMPTS.get(style, COVER_STYLE_PROMPTS['日式动画'])

        # 构建最终提示词
        final_prompt = f"{style_prompt}. Scene: {prompt}"

        system_prompt = "You are a professional image generation assistant. Please strictly follow the user requirements to generate the image. You only need to generate the image, and do not return any other content. IMPORTANT: Do not include any text, titles, or speech bubbles in the image."

        print(f"[Cover] Generating cover with style: {style}")
        print(f"[Cover] Prompt: {final_prompt[:200]}...")

        # 使用 image_client（bsk- API key）调用 nano-banana-pro
        response = image_client.chat.completions.create(
            model="nano-banana-pro",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": final_prompt}
            ],
            extra_body={
                "generationConfig": {
                    "imageConfig": {
                        "aspectRatio": "16:9",  # B站封面比例
                        "imageSize": "1K",
                    }
                }
            }
        )

        # 从响应中提取图片 URL
        choice = response.choices[0]
        message = choice.message

        image_url = None

        # 打印响应结构以便调试
        print(f"[Cover] Response message type: {type(message)}")
        print(f"[Cover] Message attributes: {dir(message)}")

        # 尝试不同的响应格式
        # 格式1: message.images 是列表，元素是字典
        if hasattr(message, 'images') and message.images:
            print(f"[Cover] Found images: {message.images}")
            img = message.images[0]
            if isinstance(img, dict):
                image_url = img.get('image_url', {}).get('url') or img.get('url')
            elif hasattr(img, 'image_url'):
                image_url = img.image_url.url if hasattr(img.image_url, 'url') else img.image_url.get('url')

        # 格式2: message.model_extra.images
        if not image_url and hasattr(message, 'model_extra') and message.model_extra:
            print(f"[Cover] Checking model_extra: {message.model_extra}")
            images = message.model_extra.get('images', [])
            if images:
                img = images[0]
                if isinstance(img, dict):
                    image_url = img.get('image_url', {}).get('url') or img.get('url')

        # 格式3: 直接在 message 上的其他属性
        if not image_url and hasattr(message, 'content') and message.content:
            # 有时图片 URL 直接在 content 中
            content = message.content
            if isinstance(content, str) and (content.startswith('http') or content.startswith('data:image')):
                image_url = content
                print(f"[Cover] Found URL in content")

        if not image_url:
            print(f"[Cover] No image in response. Full message: {message}")
            return jsonify({"error": "No image generated"}), 500

        print(f"[Cover] Image generated successfully")

        return jsonify({
            "image_url": image_url,
            "prompt": final_prompt,
            "style": style
        })

    except Exception as e:
        print(f"[Cover] Generation error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/<path:filename>')
def serve_static_files(filename):
    try:
        return send_file(os.path.join(STATIC_DIR, filename))
    except FileNotFoundError:
        return "File not found", 404

if __name__ == '__main__':
    print("Starting FunASR service...")
    print("Available endpoints:")
    print("  - GET  / : Serve frontend page")
    print("  - POST /asr : Speech recognition API")
    print("  - GET  /health : Health check")
    print("  - GET  /materials : List materials")
    print("  - POST /admin/upload : Upload material (admin)")
    print("\n并发模式: 多线程 (使用锁保护模型调用)")
    app.run(host='0.0.0.0', port=8082, debug=False, threaded=True)