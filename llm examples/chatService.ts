import { getAIClient } from '../aiClient';
import { ProjectMetadata, Shot } from '../types';

export const generateScript = async (prompt: string): Promise<any> => {
    const client = getAIClient();
    const completion = await client.chat.completions.create({
      model: 'gemini-3.0-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a master novelist. Structure the story into chapters. Output MUST be in CHINESE. Return JSON only.'
        },
        {
          role: 'user',
          content: `Create a story based on: ${prompt}. JSON structure: { "title": "...", "chapters": [{ "title": "...", "content": "..." }] }`
        }
      ],
      response_format: { type: "json_object" }
    });
    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No content returned from AI");
    const script = JSON.parse(content);
    
    // Ensure chapters are objects
    if (script.chapters && Array.isArray(script.chapters)) {
        script.chapters = script.chapters.map((chapter: any) => {
            if (typeof chapter === 'string') {
                try {
                    return JSON.parse(chapter);
                } catch (e) {
                    return { title: "Parsing Error", content: chapter };
                }
            }
            return chapter;
        });
    }

    return script;
};

export const generateBlueprint = async (storyContext: string, style: string): Promise<any> => {
    const client = getAIClient();
    const completion = await client.chat.completions.create({
      model: 'gemini-3.0-flash',
      messages: [
        {
          role: 'system',
          content: `You are a professional film director. Analyze the story and style: ${style}. Output MUST be in CHINESE. Return exactly 6 shots in JSON format.`
        },
        {
          role: 'user',
          content: `Story Context: ${storyContext}. Generate JSON: { "metadata": { "title": "...", "logline": "...", "artStyle": "...", "characters": [], "sceneConcepts": [], "musicStyle": "...", "mood": "..." }, "shots": [{ "id": 1, "description": "visual prompt", "script": "narrative line", "duration": 5, "cameraMovement": "..." }] }`
        }
      ],
      response_format: { type: "json_object" }
    });
    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No production blueprint returned");
    console.log("Raw Blueprint Content:", content);
    const parsed = JSON.parse(content);
    
    if (!parsed.shots || !Array.isArray(parsed.shots)) {
        throw new Error("Invalid blueprint format: 'shots' array is missing or invalid");
    }
    
    return { ...parsed, shots: parsed.shots.map((s: any) => ({ ...s, imagePrompt: s.description })) };
};

// --- Phase 1: Adaptation & Concept ---
export const generateConcept = async (
    userContent: string, 
    duration: string = "1-2分钟", 
    ratio: string = "9:16", 
    style: string = "Cinematic"
): Promise<ProjectMetadata> => {
    const client = getAIClient();
    const systemPrompt = `
# Role
你是一位精通“有声动态漫（Motion Comic）”的资深编剧与导演。你擅长将文本转化为**“旁白主导 + 角色演绎 + 沉浸音效”**的视听剧本。

# Task
请接收我提供的【输入内容】，执行以下**自适应处理**，并输出策划案：

1.  **若输入是灵感/短大纲：** 启动【扩充模式】。完善世界观，补充细节，构建起承转合的完整故事。
2.  **若输入是小说/长剧本：** 启动【改编模式】。删减冗长的文字描写，将其转化为“旁白口述”；保留最精彩的对话，转化为“角色台词”。

# Output Format (JSON Only)
Return a JSON object matching this structure:
{
  "title": "Project Title",
  "logline": "100 words summary",
  "visualStyle": "Midjourney style keywords (English)",
  "artStyle": "General style description (Chinese)",
  "audioTone": "Audio atmosphere description",
  "mood": "Overall mood",
  "musicStyle": "Music style description",
  "narrator": {
    "role": "Narrator persona",
    "voiceId": "Recommended voice ID (e.g. xiaolinshuo, roundface)",
    "tone": "Narrator tone"
  },
  "characters": [
    {
      "id": "char_1",
      "name": "Name",
      "description": "Personality",
      "visualDescription": "Appearance prompt (English)",
      "voiceId": "Recommended voice ID"
    }
  ],
  "sceneConcepts": ["Scene 1: ...", "Scene 2: ..."]
}
`;

    const userPrompt = `
# Input Data
*   **内容:** ${userContent}
*   **目标时长:** ${duration}
*   **画面比例:** ${ratio}
*   **偏好风格:** ${style}
`;

    const completion = await client.chat.completions.create({
        model: 'gemini-3.0-flash',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No concept returned from AI");
    
    try {
        return JSON.parse(content) as ProjectMetadata;
    } catch (e) {
        console.error("Failed to parse concept JSON:", content);
        throw new Error("Invalid concept JSON format");
    }
};

// --- Phase 2: Storyboarding ---
export const generateStoryboard = async (concept: ProjectMetadata): Promise<Shot[]> => {
    const client = getAIClient();
    const systemPrompt = `
# Role
你现在是分镜导演。请根据《策划案》编写详细的执行脚本。

# Constraints (必须遵守)
1.  **叙事逻辑:**
    *   **旁白 (VO)** 是主线，负责讲述剧情、心理活动和转场。
    *   **角色台词 (Dialogue)** 是高光点，只保留情绪最激烈的互动。
2.  **画面描述 (Visual Prompt):**
    *   必须为**英文**。
    *   必须包含 \`--no text, speech bubbles\`。
    *   **构图为运镜服务：** 
        *   若后期要 **Pan (摇镜)**，提示词需强调宽阔背景或全身像。
        *   若后期要 **Zoom (推镜头)**，提示词需强调中心细节（如眼睛、手部）。
3.  **后期指令:**
    *   使用 **Pan**, **Zoom In/Out**, **Shake**, **Parallax** 等术语。

# Output Format (JSON Only)
Return a JSON object with a "shots" array.
{
  "shots": [
    {
      "id": 1,
      "duration": 5,
      "description": "Visual description in Chinese for UI",
      "visualPrompt": "Detailed English Midjourney prompt --no text",
      "narratorVO": "Narrator text...",
      "dialogue": "Character speech...",
      "character": "Character Name",
      "script": "Combined text for display (e.g. [Narrator]: ... [Char]: ...)",
      "cameraMovement": "Pan/Zoom...",
      "sfx": "Rain, Thunder..."
    }
  ]
}
`;

    const userPrompt = `
# Input Data
Concept: ${JSON.stringify(concept)}
`;

    const completion = await client.chat.completions.create({
        model: 'gemini-3.0-flash',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No storyboard returned from AI");

    try {
        const res = JSON.parse(content);
        if (!res.shots || !Array.isArray(res.shots)) throw new Error("Missing shots array");
        
        // Post-processing to ensure imagePrompt is set
        return res.shots.map((s: any) => ({
            ...s,
            imagePrompt: s.visualPrompt || s.description
        }));
    } catch (e) {
        console.error("Failed to parse storyboard JSON:", content);
        throw new Error("Invalid storyboard JSON format");
    }
};
