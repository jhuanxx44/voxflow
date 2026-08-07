"""
VoxFlow 入口：创建 Flask app、注册 Blueprint、启动服务
"""

import os

from flask import Flask, request, send_file
from flask_cors import CORS

from config import STATIC_DIR

app = Flask(__name__)
CORS(app)

# 设置最大上传文件大小为 300MB
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024

# ====== 注册 Blueprint ======

from routes.api_v1 import api_v1_bp  # noqa: E402
from routes.asr import asr_bp  # noqa: E402
from routes.chat import chat_bp  # noqa: E402
from routes.materials import materials_bp  # noqa: E402
from routes.media import media_bp  # noqa: E402
from routes.tts import tts_bp  # noqa: E402

app.register_blueprint(asr_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(materials_bp)
app.register_blueprint(media_bp)
app.register_blueprint(tts_bp)
app.register_blueprint(api_v1_bp)


@app.after_request
def mark_legacy_api_deprecation(response):
    """Keep the original Web API for one compatibility cycle."""
    legacy_successors = {
        "/asr": "/api/v1/projects/{project_id}/transcriptions",
        "/export-media": "/api/v1/projects/{project_id}/exports",
        "/tts": "/api/v1/projects/{project_id}/speech-replacements",
    }
    successor = legacy_successors.get(request.path)
    if successor:
        response.headers["Deprecation"] = "true"
        response.headers["Link"] = f'<{successor}>; rel="successor-version"'
    return response


# ====== 静态文件路由 ======


@app.route("/")
def index():
    try:
        return send_file(os.path.join(STATIC_DIR, "index.html"))
    except FileNotFoundError:
        return """
            <h1>FunASR 语音识别服务</h1>
            <p>服务运行正常！</p>
            <p>请将你的前端页面放在 <code>static/</code> 目录下，命名为 <code>index.html</code></p>
            <p>API 端点: <code>/asr</code></p>
            """


@app.route("/<path:filename>")
def serve_static_files(filename):
    try:
        return send_file(os.path.join(STATIC_DIR, filename))
    except FileNotFoundError:
        return "File not found", 404


if __name__ == "__main__":
    print("Starting FunASR service...")
    print("Available endpoints:")
    print("  - GET  / : Serve frontend page")
    print("  - POST /asr : Speech recognition API")
    print("  - GET  /health : Health check")
    print("  - GET  /materials : List materials")
    print("  - POST /admin/upload : Upload material (admin)")
    print("  - POST /chat : LLM chat")
    print("  - POST /generate-cover : Generate cover image")
    print("  - POST /export-media : Export edited media")
    print("  - POST /tts : Text-to-speech")
    print("\n并发模式: 多线程 (使用锁保护模型调用)")
    app.run(host="0.0.0.0", port=8082, debug=False, threaded=True)
