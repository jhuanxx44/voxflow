"""
LLM 对话路由：聊天、封面生成
"""
import json
import openai
from flask import Blueprint, request, jsonify, Response

from config import LLM_API_KEY, LLM_BASE_URL, IMAGE_API_KEY

chat_bp = Blueprint('chat', __name__)

# 模块级初始化 LLM 客户端
llm_client = openai.OpenAI(
    base_url=LLM_BASE_URL,
    api_key=LLM_API_KEY,
)

# 图像生成客户端
image_client = openai.OpenAI(
    base_url=LLM_BASE_URL,
    api_key=IMAGE_API_KEY,
)

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

        if stream:
            def generate():
                try:
                    response = llm_client.chat.completions.create(
                        model="deepseek-r1",
                        messages=messages,
                        stream=True
                    )
                    for chunk in response:
                        if chunk.choices[0].delta.content:
                            yield f"data: {json.dumps({'content': chunk.choices[0].delta.content}, ensure_ascii=False)}\n\n"
                        if hasattr(chunk.choices[0].delta, 'reasoning_content') and chunk.choices[0].delta.reasoning_content:
                            yield f"data: {json.dumps({'reasoning': chunk.choices[0].delta.reasoning_content}, ensure_ascii=False)}\n\n"
                except Exception as e:
                    print(f"Stream error: {str(e)}")
                    yield f"data: {json.dumps({'content': f'[错误: {str(e)}]'}, ensure_ascii=False)}\n\n"
                finally:
                    yield "data: [DONE]\n\n"

            return Response(generate(), mimetype='text/event-stream')
        else:
            response = llm_client.chat.completions.create(
                model="deepseek-r1",
                messages=messages
            )
            result = {
                "content": response.choices[0].message.content,
            }
            if hasattr(response.choices[0].message, 'reasoning_content'):
                result["reasoning"] = response.choices[0].message.reasoning_content
            return jsonify(result)

    except Exception as e:
        print(f"Chat error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@chat_bp.route('/generate-cover', methods=['POST'])
def generate_cover():
    """生成视频封面图片 (使用 nano-banana-pro，需要 bsk- API key)"""
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

        response = image_client.chat.completions.create(
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
