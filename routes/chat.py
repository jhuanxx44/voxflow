"""
LLM 对话路由：聊天、封面生成
"""
import json
import openai
from flask import Blueprint, request, jsonify, Response

from config import LLM_BASE_URL, IMAGE_API_KEY
from utils.llm import get_client

chat_bp = Blueprint('chat', __name__)

# Gemini LLM 客户端（延迟初始化单例）
def _get_llm():
    return get_client()


# 图像生成客户端（封面生成用 OpenAI SDK + nano-banana-pro，惰性初始化）
_image_client = None


def _get_image_client():
    """获取图像生成客户端。"""
    global _image_client
    if _image_client is None:
        if not IMAGE_API_KEY:
            raise ValueError("IMAGE_API_KEY 未设置，请在 .env 中配置")
        if not LLM_BASE_URL:
            raise ValueError("LLM_BASE_URL 未设置，请在 .env 中配置")
        _image_client = openai.OpenAI(
            base_url=LLM_BASE_URL,
            api_key=IMAGE_API_KEY,
        )
    return _image_client

# 封面风格提示词映射
COVER_STYLE_PROMPTS = {
    '日式动画': 'Japanese Anime style, cel shaded, vibrant colors, Studio Ghibli inspired, high quality, 2D animation',
    '3D 动画': '3D Animation style, Pixar style, Disney style, cgsociety, 3d render, unreal engine 5, cute, vibrant, high detail',
    '像素风格': 'Pixel art style, 16-bit, retro game style, sprite art, nostalgic',
    '吉卜力': 'Studio Ghibli style, watercolor background, hand drawn animation, hayao miyazaki style, scenic, beautiful, dreamy',
    '美式漫画': 'American Comic Book style, marvel style, dc style, bold lines, dynamic shading, comic strip, heroic'
}


@chat_bp.route('/chat', methods=['POST'])
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

        llm = _get_llm()

        if stream:
            def generate():
                try:
                    for chunk in llm.chat_stream(messages):
                        if chunk["type"] == "text":
                            yield f"data: {json.dumps({'content': chunk['content']}, ensure_ascii=False)}\n\n"
                        elif chunk["type"] == "thinking":
                            yield f"data: {json.dumps({'reasoning': chunk['content']}, ensure_ascii=False)}\n\n"
                except Exception as e:
                    print(f"Stream error: {str(e)}")
                    yield f"data: {json.dumps({'content': f'[错误: {str(e)}]'}, ensure_ascii=False)}\n\n"
                finally:
                    yield "data: [DONE]\n\n"

            return Response(generate(), mimetype='text/event-stream')
        else:
            result_text = llm.chat(messages)
            return jsonify({"content": result_text})

    except Exception as e:
        print(f"Chat error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@chat_bp.route('/generate-cover', methods=['POST'])
def generate_cover():
    """使用已配置的图像模型生成视频封面。"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        style = data.get('style', '日式动画')

        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400

        style_prompt = COVER_STYLE_PROMPTS.get(style, COVER_STYLE_PROMPTS['日式动画'])
        final_prompt = f"{style_prompt}. Scene: {prompt}"

        system_prompt = "You are a professional image generation assistant. Please strictly follow the user requirements to generate the image. You only need to generate the image, and do not return any other content. IMPORTANT: Do not include any text, titles, or speech bubbles in the image."

        print(f"[Cover] Generating cover with style: {style}")
        print(f"[Cover] Prompt: {final_prompt[:200]}...")

        response = _get_image_client().chat.completions.create(
            model="nano-banana-pro",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": final_prompt}
            ],
            extra_body={
                "generationConfig": {
                    "imageConfig": {
                        "aspectRatio": "16:9",
                        "imageSize": "1K",
                    }
                }
            }
        )

        choice = response.choices[0]
        message = choice.message

        image_url = None

        print(f"[Cover] Response message type: {type(message)}")
        print(f"[Cover] Message attributes: {dir(message)}")

        # 尝试不同的响应格式
        if hasattr(message, 'images') and message.images:
            print(f"[Cover] Found images: {message.images}")
            img = message.images[0]
            if isinstance(img, dict):
                image_url = img.get('image_url', {}).get('url') or img.get('url')
            elif hasattr(img, 'image_url'):
                image_url = img.image_url.url if hasattr(img.image_url, 'url') else img.image_url.get('url')

        if not image_url and hasattr(message, 'model_extra') and message.model_extra:
            print(f"[Cover] Checking model_extra: {message.model_extra}")
            images = message.model_extra.get('images', [])
            if images:
                img = images[0]
                if isinstance(img, dict):
                    image_url = img.get('image_url', {}).get('url') or img.get('url')

        if not image_url and hasattr(message, 'content') and message.content:
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
