"""
LLM 调用示例：从 .env 读取 API Key 与服务地址，不再硬编码。
复制 .env.example 为 .env 并填写 LLM_API_KEY / LLM_BASE_URL 后运行。
"""
import os
import openai

from config import LLM_API_KEY, LLM_BASE_URL

client = openai.OpenAI(
    base_url=LLM_BASE_URL,
    api_key=LLM_API_KEY,
)

messages = [
    {"role": "system", "content": "你是个助手"},
    {"role": "user", "content": "介绍下自己"},
]
# 示例默认使用 deepseek-r1（OpenAI SDK 兼容模型），可用环境变量 LLM_MODEL 覆盖
response = client.chat.completions.create(model=os.environ.get("LLM_MODEL", "deepseek-r1"), messages=messages)

print("思考过程：")
print(response.choices[0].message.reasoning_content)

print("答案：")
print(response.choices[0].message.content)
