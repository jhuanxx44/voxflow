import { getAIClient } from '../aiClient';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const PROJECTS_DIR = path.join(__dirname, '../projects');

const STYLE_PROMPTS: Record<string, string> = {
    '日式动画': 'Japanese Anime style, cel shaded, vibrant colors, Studio Ghibli inspired, high quality, 2D animation',
    '3D 动画': '3D Animation style, Pixar style, Disney style, cgsociety, 3d render, unreal engine 5, cute, vibrant, high detail',
    '像素风格': 'Pixel art style, 16-bit, retro game style, sprite art',
    '吉卜力': 'Studio Ghibli style, watercolor background, hand drawn animation, hayao miyazaki style, scenic, beautiful',
    '美式漫画': 'American Comic Book style, marvel style, dc style, bold lines, dynamic shading, comic strip'
};

const getStylePrompt = (style: string): string => {
    const map = STYLE_PROMPTS;
    // Default to Anime if not found or if it was the old default
    return map[style] || map['日式动画'];
};

const saveBase64Image = async (projectId: string, dataUrl: string): Promise<string> => {
    const imagesDir = path.join(PROJECTS_DIR, projectId, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    // Parse data URL: data:image/png;base64,xxxxx
    let base64Data = dataUrl;
    let mimeType = 'image/png';
    let ext = '.png';

    if (dataUrl.startsWith('data:')) {
        const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            mimeType = matches[1];
            base64Data = matches[2];
            if (mimeType === 'image/jpeg') ext = '.jpg';
            if (mimeType === 'image/gif') ext = '.gif';
            if (mimeType === 'image/webp') ext = '.webp';
        }
    }

    const filename = `${Date.now()}_${crypto.randomUUID()}${ext}`;
    const filepath = path.join(imagesDir, filename);
    const buffer = Buffer.from(base64Data, 'base64');

    await fs.writeFile(filepath, buffer);
    console.log(`Image saved to: ${filepath}`);

    return `/projects/${projectId}/images/${filename}`;
};

const downloadAndSaveImage = async (projectId: string, url: string): Promise<string> => {
    const imagesDir = path.join(PROJECTS_DIR, projectId, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download image from ${url}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = `${Date.now()}_${crypto.randomUUID()}.png`;
    const filepath = path.join(imagesDir, filename);

    await fs.writeFile(filepath, buffer);
    console.log(`Image downloaded and saved to: ${filepath}`);

    return `/projects/${projectId}/images/${filename}`;
};

export const generateImage = async (projectId: string, prompt: string, style: string): Promise<string> => {
    const client = getAIClient();
    const stylePrompt = getStylePrompt(style);

    const systemPrompt = "You are a professional image generation assistant. Please strictly follow the user requirements to generate the image. You only need to generate the image, and do not return any other content. **IMPORTANT** If you need to draw text in the image, please translate all text to English.";

    const finalPrompt = `${stylePrompt}. Scene: ${prompt}`;

    const payload: any = {
        model: "nano-banana-pro",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: finalPrompt }
        ],
        extra_body: {
            generationConfig: {
                imageConfig: {
                    aspectRatio: "16:9",
                    imageSize: "1K",
                }
            }
        }
    };

    const response = await client.chat.completions.create(payload);

    const choice = response.choices[0];
    const message = choice.message as any;

    let imageUrl: string | undefined;

    if (message.images && Array.isArray(message.images) && message.images.length > 0) {
        imageUrl = message.images[0].image_url?.url;
    } else if (message.model_extra?.images?.length > 0) {
        imageUrl = message.model_extra.images[0].image_url?.url;
    }

    if (!imageUrl) {
        console.error("Nano-banana-pro full response:", JSON.stringify(response, null, 2));
        throw new Error("No image data found in nano-banana-pro response");
    }

    if (imageUrl.startsWith('http')) {
        return await downloadAndSaveImage(projectId, imageUrl);
    } else {
        return await saveBase64Image(projectId, imageUrl);
    }
};
