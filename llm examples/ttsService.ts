import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const TTS_BASE_URL = 'http://cn212000360.provider.example:8000/api/v1/tts';
const PROJECTS_DIR = path.join(__dirname, '../projects');

// --- Configuration from broker.ts ---

const AVAILABLE_VOICE_IDS = [
  'default',
  'xiaolinshuo',
  'roundface',
  'shipindao',
  'girl22',
  'girl33',
  'doraemon',
] as const;

const CHARACTER_REFERENCE_MAP: Record<string, string> = {
  default: 'examples/spk_1763634517.wav',
  xiaolinshuo: 'examples/xiaolin.wav',
  roundface: 'examples/圆脸.wav',
  shipindao: 'examples/食贫道.wav',
  girl22: 'examples/22娘.wav',
  girl33: 'examples/33娘.wav',
  doraemon: 'examples/哆啦A梦.wav',
};

type EmotionVector = {
  happy: number;
  angry: number;
  sad: number;
  afraid: number;
  disgusted: number;
  melancholic: number;
  surprised: number;
  calm: number;
};

const TONE_TO_EMOTION_MAP: Record<string, EmotionVector> = {
  // 积极情绪类
  高兴: { happy: 0.8, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.1, surprised: 0.2, calm: 0.0 },
  兴奋: { happy: 0.9, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.1, surprised: 0.1, calm: 0.0 },
  得意: { happy: 0.7, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.1, surprised: 0.1, calm: 0.3 },
  // 惊讶类
  惊讶: { happy: 0.0, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.0, surprised: 0.9, calm: 0.1 },
  好奇: { happy: 0.3, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.2, surprised: 0.65, calm: 0.2 },
  // 消极情绪类
  悲伤: { happy: 0.0, angry: 0.0, sad: 0.8, afraid: 0.0, disgusted: 0.0, melancholic: 0.2, surprised: 0.0, calm: 0.0 },
  失落: { happy: 0.0, angry: 0.0, sad: 0.6, afraid: 0.0, disgusted: 0.0, melancholic: 0.4, surprised: 0.0, calm: 0.0 },
  无奈: { happy: 0.0, angry: 0.0, sad: 0.2, afraid: 0.0, disgusted: 0.0, melancholic: 0.5, surprised: 0.0, calm: 0.3 },
  // 愤怒类
  生气: { happy: 0.0, angry: 0.8, sad: 0.0, afraid: 0.0, disgusted: 0.2, melancholic: 0.0, surprised: 0.0, calm: 0.0 },
  愤怒: { happy: 0.0, angry: 1.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.0, surprised: 0.0, calm: 0.0 },
  // 厌恶类
  吐槽: { happy: 0.0, angry: 0.3, sad: 0.05, afraid: 0.0, disgusted: 0.5, melancholic: 0.05, surprised: 0.0, calm: 0.05 },
  厌烦: { happy: 0.0, angry: 0.2, sad: 0.1, afraid: 0.0, disgusted: 0.56, melancholic: 0.12, surprised: 0.0, calm: 0.1 },
  // 恐惧类
  害怕: { happy: 0.0, angry: 0.0, sad: 0.0, afraid: 0.95, disgusted: 0.0, melancholic: 0.0, surprised: 0.1, calm: 0.0 },
  紧张: { happy: 0.0, angry: 0.0, sad: 0.0, afraid: 0.7, disgusted: 0.0, melancholic: 0.0, surprised: 0.2, calm: 0.1 },
  // 中性/平静类
  平静: { happy: 0.0, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.0, surprised: 0.0, calm: 1.0 },
  冷静: { happy: 0.0, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.0, surprised: 0.0, calm: 0.95 },
  严肃: { happy: 0.0, angry: 0.0, sad: 0.0, afraid: 0.0, disgusted: 0.0, melancholic: 0.2, surprised: 0.0, calm: 0.9 },
};

// --- Helpers ---

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const convertEmotionMapToVec = (emotionMap: EmotionVector): number[] => {
    return [
        emotionMap.happy,
        emotionMap.angry,
        emotionMap.sad,
        emotionMap.afraid,
        emotionMap.disgusted,
        emotionMap.melancholic,
        emotionMap.surprised,
        emotionMap.calm
    ];
};

// --- Main Service Function ---

export const generateAudio = async (projectId: string, text: string, voice: string = 'alloy', tone: string = 'default', emoWeight: number = 0.2): Promise<string> => {
    const audiosDir = path.join(PROJECTS_DIR, projectId, 'audios');
    await fs.mkdir(audiosDir, { recursive: true });

    const voiceMap: Record<string, string> = {
        'alloy': 'doraemon',
        'echo': 'xiaolinshuo',
        'fable': 'roundface',
        'onyx': 'shipindao',
        'nova': 'girl22',
        'shimmer': 'girl33'
    };
    
    let backendVoice = voice;
    if (voiceMap[voice]) {
        backendVoice = voiceMap[voice];
    } else if (!AVAILABLE_VOICE_IDS.includes(voice as any)) {
         // If it's not a mapped name AND not a valid ID, use default
         // But maybe 'voice' is 'default' which is in AVAILABLE_VOICE_IDS
         backendVoice = 'doraemon'; 
    }

    const character = (AVAILABLE_VOICE_IDS.includes(backendVoice as any) ? backendVoice : 'default') as string;
    const promptAudio = CHARACTER_REFERENCE_MAP[character] || CHARACTER_REFERENCE_MAP.default;
    
    // Determine emotion control
    let emoControlMethod = 0;
    let emoText = '';
    let emoVec: number[] | undefined;
    let finalEmoWeight = emoWeight;

    if (tone && tone !== 'default' && tone !== '平静') {
        const emotionVector = TONE_TO_EMOTION_MAP[tone];
        if (emotionVector) {
            // Method 2: Vector control
            emoControlMethod = 2;
            emoVec = convertEmotionMapToVec(emotionVector);
            finalEmoWeight = 0.2; // Override weight for vector control per broker logic
        } else {
            // Method 3: Text control
            emoControlMethod = 3;
            emoText = tone;
            finalEmoWeight = 0.25; // Override weight for text control per broker logic
        }
    }

    const taskPayload: any = {
        text,
        prompt_audio: promptAudio,
        return_audio: false, 
        emo_control_method: emoControlMethod,
        max_text_tokens_per_segment: 220,
        max_mel_tokens: 2400
    };

    if (emoControlMethod !== 0) {
        taskPayload.emo_weight = finalEmoWeight;
    }

    if (emoControlMethod === 2 && emoVec) {
        taskPayload.emo_vec = emoVec;
    } else if (emoControlMethod === 3 && emoText) {
        taskPayload.emo_text = emoText;
    }

    // 1. Create Task
    const createRes = await fetch(`${TTS_BASE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload)
    });

    if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create TTS task: ${createRes.status} ${errText}`);
    }

    const taskData = await createRes.json();
    const eventId = taskData.task_id; // broker.ts expects task_id

    if (!eventId) {
       console.error("Task creation response:", taskData);
       throw new Error("No task_id returned from TTS service");
    }

    // 2. Poll for Result
    const pollTimeout = 20; // 20 attempts
    let audioUrl = '';

    for (let attempt = 0; attempt < pollTimeout; attempt++) {
        const pollRes = await fetch(`${TTS_BASE_URL}/tasks/${eventId}`);
        if (!pollRes.ok) {
             throw new Error(`Failed to poll TTS task: ${pollRes.status} ${pollRes.statusText}`);
        }

        const pollData = await pollRes.json();
        const status = pollData.status;

        if (status === 'failed') {
            throw new Error(`TTS task failed: ${pollData.message}`);
        }

        if (status === 'completed') {
            audioUrl = `${TTS_BASE_URL}/tasks/${eventId}/result`;
            break;
        }

        // Optimized Polling: Check frequently at first
        let delayMs = 500;
        if (attempt > 5) delayMs = 1000;
        if (attempt > 10) delayMs = 2000;
        
        await delay(delayMs);
    }

    if (!audioUrl) {
        throw new Error(`TTS task polling timeout after ${pollTimeout} attempts`);
    }

    // 3. Download and Save
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error("Failed to download generated audio");

    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    if (buffer.length === 0) {
        throw new Error('Downloaded audio file is empty');
    }

    const filename = `${Date.now()}_${crypto.randomUUID()}.wav`;
    const filepath = path.join(audiosDir, filename);
    await fs.writeFile(filepath, buffer);
    console.log(`Audio saved to: ${filepath}`);

    return `/projects/${projectId}/audios/${filename}`;
};