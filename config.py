"""
全局配置：常量、目录、共享可变状态、并发控制
"""
import os
import threading

# ====== 目录配置 ======

RESULT_DIR = "result"
STATIC_DIR = "static"
MATERIALS_DIR = os.path.expanduser("~/funasr_server/materials")
CACHE_DIR = os.path.expanduser("~/funasr_server/cache")
EXPORT_TEMP_DIR = os.path.expanduser("~/funasr_server/exports")
UPLOADS_TEMP_DIR = os.path.expanduser("~/funasr_server/uploads_temp")
TTS_CACHE_DIR = os.path.expanduser("~/funasr_server/tts_cache")

# 确保所有目录存在
for _dir in [RESULT_DIR, STATIC_DIR, MATERIALS_DIR, CACHE_DIR,
             EXPORT_TEMP_DIR, UPLOADS_TEMP_DIR, TTS_CACHE_DIR]:
    os.makedirs(_dir, exist_ok=True)

# ====== 业务常量 ======

ADMIN_PASSWORD = "replace-with-a-long-random-password"
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'}
UPLOAD_FILE_TTL = 8 * 3600  # 上传文件保留时间（8小时）

# ====== TTS 配置 ======

TTS_SERVICE_URL = "http://cn212000360.provider.example:8000"
TTS_DEFAULT_PROMPT_AUDIO = "examples/xiaolin.wav"
# TTS 服务器参考音频上传端点（需在 TTS 服务器上部署 upload-prompt 补丁）
TTS_UPLOAD_ENABLED = True

# ====== LLM 配置 ======

LLM_API_KEY = "replace-with-provider-key"
LLM_BASE_URL = "http://llmapi.provider.example/v1"
IMAGE_API_KEY = "replace-with-provider-key"

# ====== 共享可变状态 ======

# 导出任务存储（task_id -> 文件信息）
export_tasks = {}
# 上传文件存储（file_id -> 文件信息）
uploaded_files = {}

# ====== 并发控制 ======

# 导出并发控制（最多同时 3 个导出任务）
export_semaphore = threading.Semaphore(3)
# TTS 并发控制（最多同时 2 个 TTS 任务）
tts_semaphore = threading.Semaphore(2)
