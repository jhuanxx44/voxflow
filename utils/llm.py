"""
Gemini LLM 客户端封装（同步版本，适配 Flask）
基于 pptgenaiserver/utils/llm.py 简化，去掉多模态和 Token 统计
"""
import time
from typing import List, Optional, Generator

from google import genai
from google.genai import types
from dotenv import load_dotenv

from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL

load_dotenv()

# 429 限流重试配置
MAX_429_RETRIES = 3
_429_BASE_WAIT = 5  # 秒，退避序列：5s, 10s, 20s


def _is_rate_limit_error(e: Exception) -> bool:
    """检查异常是否为 429 限流错误"""
    err_str = str(e).lower()
    return any(keyword in err_str for keyword in [
        '429', 'resource_exhausted', 'rate limit', 'rate_limit', 'too many requests'
    ])


class GeminiClient:
    """
    封装 Google Gemini API 的同步客户端，用于 VoxFlow 文本对话场景
    """

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.model = model or LLM_MODEL or "gemini-2.5-flash"

        self.api_key = api_key or LLM_API_KEY
        if not self.api_key:
            raise ValueError("API 密钥未设置，请在 .env 中配置 LLM_API_KEY")

        self.base_url = base_url or LLM_BASE_URL
        if not self.base_url:
            raise ValueError("LLM 服务地址未设置，请在 .env 中配置 LLM_BASE_URL")

        self.client = genai.Client(
            api_key=self.api_key,
            vertexai=True,
            http_options={"base_url": f"{self.base_url}/gemini/", "timeout": 280000},
        )

    def _messages_to_contents(self, messages: List[dict]) -> tuple[List[types.Content], Optional[str]]:
        """
        将 OpenAI 格式的 messages 转换为 Gemini Contents

        Args:
            messages: [{"role": "system"|"user"|"assistant", "content": "..."}]

        Returns:
            (contents, system_instruction) 元组
        """
        system_instruction = None
        contents = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                system_instruction = content
                continue

            # Gemini 用 "model" 表示 assistant
            gemini_role = "model" if role == "assistant" else "user"
            contents.append(types.Content(
                role=gemini_role,
                parts=[types.Part(text=content)],
            ))

        # 如果有 system_instruction 但 contents 为空，添加占位
        if not contents:
            contents.append(types.Content(
                role="user",
                parts=[types.Part(text="你好")],
            ))

        return contents, system_instruction

    def chat(self, messages: List[dict]) -> str:
        """
        非流式对话

        Args:
            messages: OpenAI 格式的消息列表

        Returns:
            响应文本
        """
        contents, system_instruction = self._messages_to_contents(messages)

        config = types.GenerateContentConfig(
            temperature=1.0,
            top_p=0.95,
            thinking_config=types.ThinkingConfig(thinking_budget=24576),
        )
        if system_instruction:
            config.system_instruction = system_instruction

        # 429 重试
        response = None
        for retry in range(MAX_429_RETRIES + 1):
            try:
                response = self.client.models.generate_content(
                    model=self.model, contents=contents, config=config
                )
                break
            except Exception as e:
                if _is_rate_limit_error(e) and retry < MAX_429_RETRIES:
                    wait = _429_BASE_WAIT * (2 ** retry)
                    print(f"[429] 触发限流，{wait}s 后重试 ({retry + 1}/{MAX_429_RETRIES})")
                    time.sleep(wait)
                else:
                    raise

        # 提取文本
        if hasattr(response, "text"):
            return response.text

        if hasattr(response, "candidates") and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, "content") and candidate.content:
                return "".join(part.text for part in candidate.content.parts if hasattr(part, "text"))

        return ""

    def chat_stream(self, messages: List[dict]) -> Generator[dict, None, None]:
        """
        流式对话（同步生成器）

        Args:
            messages: OpenAI 格式的消息列表

        Yields:
            {"type": "text", "content": "..."} 或 {"type": "thinking", "content": "..."}
        """
        contents, system_instruction = self._messages_to_contents(messages)

        config = types.GenerateContentConfig(
            temperature=1.0,
            top_p=0.95,
            thinking_config=types.ThinkingConfig(thinking_budget=24576),
        )
        if system_instruction:
            config.system_instruction = system_instruction

        # 429 重试（只在首次建立流时重试）
        resp_stream = None
        for retry in range(MAX_429_RETRIES + 1):
            try:
                resp_stream = self.client.models.generate_content_stream(
                    model=self.model, contents=contents, config=config
                )
                break
            except Exception as e:
                if _is_rate_limit_error(e) and retry < MAX_429_RETRIES:
                    wait = _429_BASE_WAIT * (2 ** retry)
                    print(f"[429] 触发限流，{wait}s 后重试 ({retry + 1}/{MAX_429_RETRIES})")
                    time.sleep(wait)
                else:
                    raise

        for event in resp_stream:
            # 检查 candidates 中的 parts，区分 thinking 和正文
            if hasattr(event, "candidates") and event.candidates:
                candidate = event.candidates[0]
                if hasattr(candidate, "content") and candidate.content:
                    for part in candidate.content.parts:
                        if hasattr(part, "thought") and part.thought and hasattr(part, "text") and part.text:
                            yield {"type": "thinking", "content": part.text}
                        elif hasattr(part, "text") and part.text:
                            yield {"type": "text", "content": part.text}

            # 兼容简单的 text 属性
            elif hasattr(event, "text") and event.text:
                yield {"type": "text", "content": event.text}


# 模块级单例，供 routes 直接导入
_default_client: Optional[GeminiClient] = None


def get_client() -> GeminiClient:
    """获取默认 GeminiClient 单例"""
    global _default_client
    if _default_client is None:
        _default_client = GeminiClient()
    return _default_client
