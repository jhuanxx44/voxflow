"""
全局配置：常量、目录、共享可变状态、并发控制

所有密钥和外部服务地址统一从环境变量 / .env 读取（变量清单见 .env.example），
代码中不再硬编码任何 key 或 URL。
"""
import os
import threading
from dotenv import load_dotenv

# 优先加载项目根目录的 .env，兼容从任意目录启动
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

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

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'}
UPLOAD_FILE_TTL = 8 * 3600  # 上传文件保留时间（8小时）

# ====== 环境变量读取工具 ======


def _env(name: str, default: str = "") -> str:
    """读取字符串环境变量，未设置且无默认值时打印警告"""
    value = os.environ.get(name, default)
    if not value and not default:
        print(f"[config] 警告：未设置环境变量 {name}，请在 .env 中配置（参考 .env.example）")
    return value


def _env_bool(name: str, default: bool = False) -> bool:
    """读取布尔环境变量（1/true/yes/on 视为 True）"""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# ====== 敏感配置（统一走 .env，禁止硬编码）=======

# 素材库管理后台密码
ADMIN_PASSWORD = _env("ADMIN_PASSWORD")

# ====== TTS 配置 ======

# IndexTTS 服务地址
TTS_SERVICE_URL = _env("TTS_SERVICE_URL")
# 默认参考音频（TTS 服务器上的路径）
TTS_DEFAULT_PROMPT_AUDIO = _env("TTS_DEFAULT_PROMPT_AUDIO", "examples/xiaolin.wav")
# TTS 服务器参考音频上传端点（需在 TTS 服务器上部署 upload-prompt 补丁）
TTS_UPLOAD_ENABLED = _env_bool("TTS_UPLOAD_ENABLED", True)

# ====== LLM 配置 ======

# 文本对话 LLM（personal- 前缀 key）
LLM_API_KEY = _env("LLM_API_KEY")
LLM_BASE_URL = _env("LLM_BASE_URL")
LLM_MODEL = _env("LLM_MODEL", "gemini-3.1-pro")
# 图像生成封面（bsk- 前缀 key）
IMAGE_API_KEY = _env("IMAGE_API_KEY")

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
