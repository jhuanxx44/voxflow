/**
 * TTS Service - Handles text-to-speech generation with voice cloning support
 */

export interface TTSSource {
  type: 'material' | 'upload';
  name?: string;
  file_id?: string;
}

export interface TTSOptions {
  text: string;
  source: TTSSource;
  refSegments: Array<{ start: number; end: number }>;
  emotion?: string;
}

export interface TTSResult {
  blobUrl: string;
  blob: Blob;
  durationMs?: number;
}

/**
 * Parse WAV header to extract duration in milliseconds.
 * WAV header: bytes 28-31 = byteRate, bytes 40-43 = data chunk size
 */
function getWavDurationMs(buffer: ArrayBuffer): number | undefined {
  try {
    const view = new DataView(buffer);
    const byteRate = view.getUint32(28, true);
    if (byteRate === 0) return undefined;

    // Find the "data" chunk
    let offset = 12;
    while (offset < buffer.byteLength - 8) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 'data') {
        return (chunkSize / byteRate) * 1000;
      }
      offset += 8 + chunkSize;
    }

    // Fallback: use total file size
    const dataSize = buffer.byteLength - 44;
    return dataSize > 0 ? (dataSize / byteRate) * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Generate TTS audio with optional voice cloning
 *
 * @param options - TTS generation options
 * @returns TTS result with blob URL and optional duration
 * @throws Error if generation fails
 */
export async function generateTTS(options: TTSOptions): Promise<TTSResult> {
  const { text, source, refSegments, emotion } = options;

  const body: Record<string, unknown> = {
    text,
    source: {
      type: source.type,
      ...(source.name && { name: source.name }),
      ...(source.file_id && { file_id: source.file_id }),
    },
    ref_segments: refSegments.map((s) => ({ start: s.start, end: s.end })),
  };

  if (emotion) {
    body.emotion = emotion;
  }

  const response = await fetch('/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMsg = `TTS request failed (${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error) errorMsg = errData.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(errorMsg);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('audio')) {
    // Try to parse as JSON error
    const data = await response.json();
    throw new Error(data.error || 'Unexpected response from TTS service');
  }

  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
  const blobUrl = URL.createObjectURL(blob);
  const durationMs = getWavDurationMs(arrayBuffer);

  return { blobUrl, blob, durationMs };
}
