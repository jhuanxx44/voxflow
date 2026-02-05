/**
 * ASR Service
 *
 * Handles API calls for ASR recognition.
 * Supports both file upload and material selection.
 */

import type { ASRResult } from '@/types/asr';

export interface RecognizeOptions {
  file?: File;
  materialName?: string;
  enableAdvanced: boolean;
  hotwords?: string;
  endpoint?: string;
}

export interface RecognizeResponse extends ASRResult {
  hotwords_used?: string | null;
  uploaded_file_id?: string; // 上传文件的 ID，用于导出
}

/**
 * Perform ASR recognition
 *
 * @param options Recognition options
 * @returns ASR result with segments
 */
export async function recognize(
  options: RecognizeOptions
): Promise<RecognizeResponse> {
  const { file, materialName, enableAdvanced, hotwords, endpoint = '/asr' } =
    options;

  // Validate input
  if (!file && !materialName) {
    throw new Error('请先选择音频文件或素材');
  }

  // Build FormData
  const formData = new FormData();

  if (materialName) {
    formData.append('material_name', materialName);
  } else if (file) {
    formData.append('audio', file);
  }

  formData.append('enable_advanced', enableAdvanced ? 'true' : 'false');

  if (hotwords && hotwords.trim()) {
    formData.append('hotwords', hotwords.trim());
  }

  // Make request
  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  // Handle response
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  const text = await response.text();
  let data: RecognizeResponse;

  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('响应不可解析为JSON');
  }

  return data;
}

/**
 * Normalize ASR result to standard format
 *
 * Handles different response formats from the backend
 */
export function normalizeResult(data: any): ASRResult {
  // Array format: [{ text: fullText }, ...segments]
  if (Array.isArray(data)) {
    const full =
      data[0] && typeof data[0].text === 'string' ? data[0].text : '';
    return {
      full_text: full,
      segments: data.slice(1),
    };
  }

  // Object format with segments array
  if (data && Array.isArray(data.segments)) {
    const full =
      typeof data.text === 'string'
        ? data.text
        : data.segments.map((s: any) => (s && s.text) || '').join('');

    // 如果 segments 为空但有 text，创建一个包含整个文本的 segment
    let segments = data.segments;
    if (segments.length === 0 && full) {
      segments = [{
        text: full,
        start: 0,
        end: 0,
        spk: undefined,
      }];
    }

    return {
      full_text: full,
      segments: segments,
    };
  }

  // Fallback
  const full = data && typeof data.text === 'string' ? data.text : '';
  const segs = data && Array.isArray(data) ? data : [];
  return {
    full_text: full,
    segments: segs,
  };
}

/**
 * Get server status
 */
export async function getServerStatus() {
  const response = await fetch('/server-status');

  if (!response.ok) {
    throw new Error('服务器错误');
  }

  const data = await response.json();
  return data;
}
