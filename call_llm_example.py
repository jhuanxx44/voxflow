import openai
import os

api_key = "***REMOVED***"

client = openai.OpenAI(
    base_url="http://llmapi.bilibili.co/v1",
    api_key=api_key,
)

messages = [
    {"role": "system", "content": "你是个助手"},
    {"role": "user", "content": "介绍下自己"},
]
response = client.chat.completions.create(model="deepseek-r1", messages=messages)

print("思考过程：")
print(response.choices[0].message.reasoning_content)

print("答案：")
print(response.choices[0].message.content)
