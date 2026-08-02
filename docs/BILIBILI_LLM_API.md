# B站 LLM API 集成指南

本文档记录 B站内部 LLM API (`llmapi.bilibili.co`) 的使用经验和注意事项。

## API 端点

```
Base URL: http://llmapi.bilibili.co/v1
```

兼容 OpenAI API 格式，可使用 `openai` Python/JS SDK 调用。

---

## API Key 权限区分

**重要**: 不同前缀的 API Key 有不同的模型访问权限！

| API Key 前缀 | 可用模型 | 用途 |
|-------------|---------|------|
| `personal-` | `deepseek-r1` 等文本模型 | 文本对话、推理 |
| `bsk-` | `nano-banana-pro` 等图像模型 | 图像生成 |

### 示例配置

```python
import openai

LLM_BASE_URL = "http://llmapi.bilibili.co/v1"

# 文本对话客户端
llm_client = openai.OpenAI(
    base_url=LLM_BASE_URL,
    api_key="personal-xxxxxxx",  # personal- 前缀
)

# 图像生成客户端（必须使用 bsk- 前缀的 key）
image_client = openai.OpenAI(
    base_url=LLM_BASE_URL,
    api_key="bsk-xxxxxxx",  # bsk- 前缀
)
```

### 常见错误

如果使用错误的 API Key 调用模型，会返回：
```json
{"error": {"code": "model_not_found", "message": "The model `nano-banana-pro` not found"}}
```

---

## nano-banana-pro 图像生成

### 请求格式

```python
response = image_client.chat.completions.create(
    model="nano-banana-pro",
    messages=[
        {"role": "system", "content": "You are a professional image generation assistant..."},
        {"role": "user", "content": "Scene description..."}
    ],
    extra_body={
        "generationConfig": {
            "imageConfig": {
                "aspectRatio": "16:9",  # 支持 16:9, 9:16, 1:1 等
                "imageSize": "1K",      # 分辨率
            }
        }
    }
)
```

### 响应格式解析

**重要**: 响应中的图片数据是**字典格式**，不是对象属性！

```python
choice = response.choices[0]
message = choice.message

image_url = None

# 格式1: message.images 是列表，元素是字典
if hasattr(message, 'images') and message.images:
    img = message.images[0]
    if isinstance(img, dict):
        # 正确: 使用字典访问
        image_url = img.get('image_url', {}).get('url') or img.get('url')
    # 错误: img.image_url.url  # 会报 'dict' object has no attribute 'image_url'

# 格式2: message.model_extra.images
if not image_url and hasattr(message, 'model_extra') and message.model_extra:
    images = message.model_extra.get('images', [])
    if images:
        img = images[0]
        if isinstance(img, dict):
            image_url = img.get('image_url', {}).get('url') or img.get('url')

# 格式3: 图片 URL 直接在 content 中
if not image_url and hasattr(message, 'content') and message.content:
    content = message.content
    if isinstance(content, str) and (content.startswith('http') or content.startswith('data:image')):
        image_url = content
```

### 常见错误

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `'dict' object has no attribute 'image_url'` | 把字典当对象访问 | 使用 `dict.get()` 方法 |
| `model_not_found` | API Key 没有图像模型权限 | 使用 `bsk-` 前缀的 key |
| `No image generated` | 响应格式不匹配 | 添加调试日志，检查实际响应结构 |

---

## 调试技巧

### 1. 打印响应结构

```python
print(f"Message type: {type(message)}")
print(f"Message attributes: {dir(message)}")
print(f"Images: {message.images if hasattr(message, 'images') else 'N/A'}")
print(f"Model extra: {message.model_extra if hasattr(message, 'model_extra') else 'N/A'}")
```

### 2. 处理多种响应格式

API 响应格式可能会变化，建议：
- 使用 `isinstance()` 检查类型
- 使用 `hasattr()` 检查属性存在
- 使用 `dict.get()` 安全访问字典
- 提供多种格式的兼容处理

### 3. TypeScript vs Python 差异

TypeScript 示例代码：
```typescript
imageUrl = message.images[0].image_url?.url;
```

对应的 Python 代码（注意字典访问）：
```python
# 错误
image_url = message.images[0].image_url.url

# 正确
img = message.images[0]
if isinstance(img, dict):
    image_url = img.get('image_url', {}).get('url')
```

---

## 风格提示词参考

```python
COVER_STYLE_PROMPTS = {
    '日式动画': 'Japanese Anime style, cel shaded, vibrant colors, Studio Ghibli inspired, high quality, 2D animation',
    '3D 动画': '3D Animation style, Pixar style, Disney style, cgsociety, 3d render, unreal engine 5, cute, vibrant, high detail',
    '像素风格': 'Pixel art style, 16-bit, retro game style, sprite art, nostalgic',
    '吉卜力': 'Studio Ghibli style, watercolor background, hand drawn animation, hayao miyazaki style, scenic, beautiful, dreamy',
    '美式漫画': 'American Comic Book style, marvel style, dc style, bold lines, dynamic shading, comic strip, heroic'
}
```

---

## 相关文件

- `app.py` - 后端 API 集成代码
- `llm examples/imageService.ts` - TypeScript 示例（注意响应处理差异）
- `llm examples/aiClient.ts` - API 客户端配置示例
- `.env.example` - 环境变量模板（所有 API Key / Base URL 统一在此配置，复制为 `.env` 使用）

> 注意：API Key 不再硬编码在代码或示例文件中，统一从 `.env` 读取（见 `config.py`）。
