"""
VoxFlow 入口：创建 Flask app、注册 Blueprint、启动服务
"""

import os

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "VOXFLOW_CORS_ORIGINS",
        "http://127.0.0.1:3001,http://localhost:3001",
    ).split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": cors_origins}})

# 设置最大上传文件大小为 300MB
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024

# ====== 注册 Blueprint ======

from legacy_web.routes.asr import asr_bp  # noqa: E402
from legacy_web.routes.chat import chat_bp  # noqa: E402
from legacy_web.routes.materials import materials_bp  # noqa: E402
from legacy_web.routes.media import media_bp  # noqa: E402
from legacy_web.routes.tts import tts_bp  # noqa: E402
from voxflow.interfaces.web.api_v1 import api_v1_bp  # noqa: E402

app.register_blueprint(asr_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(materials_bp)
app.register_blueprint(media_bp)
app.register_blueprint(tts_bp)
app.register_blueprint(api_v1_bp)


@app.after_request
def mark_legacy_api_deprecation(response):
    """Advertise the repository-only Web compatibility surface and its sunset."""
    legacy_successors = {
        "/asr": "/api/v1/projects/{project_id}/transcriptions",
        "/export-media": "/api/v1/projects/{project_id}/exports",
        "/tts": "/api/v1/projects/{project_id}/speech-replacements",
    }
    if request.blueprint in {"asr", "chat", "materials", "media", "tts"}:
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = "Thu, 31 Dec 2026 23:59:59 GMT"
        links = [
            "<https://github.com/jhuanxx44/voxflow/blob/dev_edit/docs/ARCHITECTURE.md>"
            '; rel="deprecation"'
        ]
        successor = legacy_successors.get(request.path)
        if successor:
            links.append(f'<{successor}>; rel="successor-version"')
        response.headers["Link"] = ", ".join(links)
    return response


@app.route("/")
def index():
    return jsonify(
        {
            "name": "VoxFlow",
            "version": "1.0.0",
            "api": "/api/v1/capabilities",
            "frontend": "http://127.0.0.1:3001",
        }
    )


if __name__ == "__main__":
    print("Starting VoxFlow local Web API...")
    print("Versioned API: /api/v1/capabilities")
    print("Legacy compatibility endpoints are deprecated; see docs/ARCHITECTURE.md")
    host = os.environ.get("VOXFLOW_WEB_HOST", "127.0.0.1")
    port = int(os.environ.get("VOXFLOW_WEB_PORT", "8082"))
    app.run(host=host, port=port, debug=False, threaded=True)
