/**
 * Export Service - 处理媒体和字幕导出
 */

export interface ExportSegment {
  start: number; // 毫秒
  end: number; // 毫秒
  text: string;
}

export interface ExportSource {
  type: 'material' | 'upload';
  name: string;
  file_id?: string; // 上传文件的 ID
}

export interface ExportOptions {
  segments: ExportSegment[];
  source: ExportSource;
  outputFormat: 'mp4' | 'mp3' | 'wav';
}

export interface ExportResponse {
  status: 'ready';
  download_url?: string;
  filename: string;
  size?: number;
  expires_in?: number;
}

export interface ExportResult {
  blob?: Blob;
  downloadUrl?: string;
  filename: string;
}

/**
 * 导出编辑后的媒体文件
 * 小文件直接返回 blob，大文件返回下载链接
 */
export async function exportMedia(
  options: ExportOptions,
  onProgress?: (message: string) => void
): Promise<ExportResult> {
  onProgress?.('正在处理...');

  let response: Response;
  try {
    response = await fetch('/export-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segments: options.segments,
        source: options.source,
        output_format: options.outputFormat,
      }),
    });
  } catch (e) {
    // 网络错误（后端未运行、断网等）
    throw new Error('无法连接到服务器，请确保后端服务已启动');
  }

  if (!response.ok) {
    // 尝试解析 JSON 错误信息
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `服务器错误 (HTTP ${response.status})`);
    } else {
      // 非 JSON 响应，可能是后端未运行时的代理错误
      if (response.status === 404) {
        throw new Error('导出接口不存在，请确保后端服务已启动');
      }
      throw new Error(`服务器错误 (HTTP ${response.status})`);
    }
  }

  // 检查 Content-Type 判断响应类型
  const contentType = response.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    // 大文件 - 返回下载链接
    const data: ExportResponse = await response.json();
    return {
      downloadUrl: data.download_url,
      filename: data.filename,
    };
  } else {
    // 小文件 - 直接返回 blob
    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] || `export.${options.outputFormat}`;

    return { blob, filename };
  }
}

/**
 * 生成 SRT 字幕内容
 * 时间戳根据编辑后顺序累加计算
 */
export function generateSRT(segments: ExportSegment[]): string {
  let srt = '';
  let cumulativeTime = 0;

  segments.forEach((seg, index) => {
    const duration = seg.end - seg.start;
    const startTime = cumulativeTime;
    const endTime = cumulativeTime + duration;

    srt += `${index + 1}\n`;
    srt += `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n`;
    srt += `${seg.text}\n\n`;

    cumulativeTime = endTime;
  });

  return srt.trim();
}

/**
 * 生成 VTT 字幕内容
 * 时间戳根据编辑后顺序累加计算
 */
export function generateVTT(segments: ExportSegment[]): string {
  let vtt = 'WEBVTT\n\n';
  let cumulativeTime = 0;

  segments.forEach((seg, index) => {
    const duration = seg.end - seg.start;
    const startTime = cumulativeTime;
    const endTime = cumulativeTime + duration;

    vtt += `${index + 1}\n`;
    vtt += `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)}\n`;
    vtt += `${seg.text}\n\n`;

    cumulativeTime = endTime;
  });

  return vtt.trim();
}

/**
 * 格式化时间为 SRT 格式: HH:MM:SS,mmm
 */
function formatSRTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

/**
 * 格式化时间为 VTT 格式: HH:MM:SS.mmm
 */
function formatVTTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}

function pad(num: number, length: number = 2): string {
  return num.toString().padStart(length, '0');
}

/**
 * 触发浏览器下载 Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 触发浏览器下载文本内容
 */
export function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}
