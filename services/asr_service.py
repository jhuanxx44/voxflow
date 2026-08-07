"""
ASR 服务：FunASR 模型初始化、请求计数、缓存逻辑
"""
import os
import json
import threading
from config import CACHE_DIR


# ====== 模型初始化 ======

class LazyAutoModel:
    """Keep legacy Flask imports cheap; load FunASR only on the first generate call."""

    def __init__(self, **model_kwargs):
        self.model_kwargs = model_kwargs
        self._instance = None
        self._init_lock = threading.Lock()

    def _get(self):
        if self._instance is not None:
            return self._instance
        with self._init_lock:
            if self._instance is None:
                from funasr import AutoModel

                self._instance = AutoModel(**self.model_kwargs)
        return self._instance

    def generate(self, **kwargs):
        return self._get().generate(**kwargs)


_base_model_args = {
    "model": "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
    "trust_remote_code": True,
    "disable_update": True,
}

# 基础模型（支持热词）和高级模型均惰性初始化。
basic_model = LazyAutoModel(**_base_model_args)
advanced_model = LazyAutoModel(
    **_base_model_args,
    vad_model="fsmn-vad",
    punc_model="ct-punc",
    spk_model="cam++",
)

# 创建线程锁，保护模型调用
basic_model_lock = threading.Lock()
advanced_model_lock = threading.Lock()


# ====== 请求计数器 ======

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


# ====== 缓存函数 ======

def get_cache_key(material_name, model_type):
    """生成缓存键，格式: 素材名_模型类型.json"""
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
