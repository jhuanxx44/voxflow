/**
 * Chat Service - Handles SSE streaming communication with the /chat endpoint
 */

import type { ChatMessage } from '@/types';

/**
 * Streaming chunk data structure
 */
export interface StreamChunk {
  reasoning?: string;
  content?: string;
}

/**
 * Callback for receiving streaming chunks
 */
export type StreamCallback = (chunk: StreamChunk) => void;

/**
 * Build system message with ASR context
 * ASR text is only included once in the system message
 */
function buildSystemMessage(asrText: string | null): string {
  if (!asrText) {
    return `你是一个有帮助的助手。你正在一个语音识别编辑器中工作。

这是一个基于 FunASR（阿里巴巴开源语音识别模型）的音视频转文字编辑器，主要功能包括：

1. **上传媒体文件**：支持拖拽上传或从素材库选择音频/视频文件（视频会自动提取音频进行识别）
2. **语音识别**：将音频转换为带时间戳的文字，支持说话人识别和热词配置
3. **编辑功能**：
   - 逐段编辑或逐字编辑模式
   - 拖拽调整顺序
   - 右键删除句子
   - 搜索并删除口癖词（如"嗯"、"那个"等）
4. **AI辅助**：
   - 快速删除口癖：AI分析并批量删除无意义填充词
   - 快速润色：AI识别同音字错误并提供修正建议
   - 概括总结、翻译等

注意：用户尚未上传媒体文件或进行语音识别，目前没有可用的ASR转录结果。
如果用户询问与转录内容相关的问题（如总结、分析口癖、润色等），请友好地提醒他们先上传音频/视频并进行识别。
对于其他一般性问题，正常回答即可。`;
  }

  return `你是一个有帮助的助手。用户正在使用语音识别工具，以下是识别结果：

<asr_transcript>
${asrText}
</asr_transcript>

你可以基于这段内容回答用户的问题（如总结、分析、修改、翻译等）。如果用户的问题与转录内容无关，正常回答即可。`;
}

/**
 * Build system message for filler word analysis
 * Returns a specialized prompt that instructs LLM to analyze filler words
 */
function buildFillerAnalysisPrompt(asrText: string): string {
  return `你是一个语音识别结果分析助手。请分析以下语音识别结果中的口癖词。

<asr_transcript>
${asrText}
</asr_transcript>

请找出所有重复出现的口癖词（如"嗯"、"那个"、"就是"、"然后"、"对"等无意义的填充词），并按以下格式返回：

1. 先用中文列出每个口癖词及其出现次数
2. 然后在 <filler_data> 标签中返回JSON格式的数据

严格按照以下格式输出：

根据分析，这段语音识别结果中存在以下口癖词：

1. **嗯** - 出现 X 次
2. **那个** - 出现 X 次

<filler_data>
{"fillers":[{"text":"嗯","count":X},{"text":"那个","count":X}]}
</filler_data>

请在下方选择要删除的口癖词。

注意：
- 只列出出现2次及以上的口癖词
- 不要列出有实际意义的词语
- JSON中的count必须是实际统计的次数
- 如果没有发现口癖词，返回空数组：{"fillers":[]}`;
}

/**
 * Build system message for polish analysis (text correction)
 * Returns a specialized prompt that instructs LLM to find recognition errors
 */
function buildPolishAnalysisPrompt(asrText: string): string {
  return `你是一个语音识别结果润色助手。请分析以下语音识别结果中可能的识别错误。

<asr_transcript>
${asrText}
</asr_transcript>

请找出所有可能的识别错误，主要包括：
1. **同音字/近音字错误**：如"玉玉症"应为"抑郁症"、"在坐"应为"在座"
2. **专业术语错误**：医学、法律、技术等领域的专业词汇
3. **常见错字**：如"既使"应为"即使"、"的地得"混淆

**重要约束**：
- 替换后的文本**字数必须与原文相同**，以保持时间戳对齐
- 如果无法保持字数相同，请在reason中说明
- 只列出有明确错误的词语，不要过度修改

按以下格式返回：

1. 先用表格列出每个替换建议
2. 然后在 <polish_data> 标签中返回JSON格式的数据

严格按照以下格式输出：

根据分析，这段语音识别结果中可能存在以下识别错误：

| 原文 | 建议修正 | 出现次数 | 原因 |
|------|----------|----------|------|
| 玉玉症 | 抑郁症 | 2 | 同音字错误 |

<polish_data>
{"replacements":[{"old":"玉玉症","new":"抑郁症","count":2,"reason":"同音字错误"}]}
</polish_data>

请在下方选择要应用的修正。

注意：
- old和new的字数应该相同
- count必须是实际统计的出现次数
- 如果没有发现错误，返回空数组：{"replacements":[]}`;
}

// Special analysis marker prefixes
const FILLER_ANALYSIS_MARKER = '[FILLER_ANALYSIS]';
const POLISH_ANALYSIS_MARKER = '[POLISH_ANALYSIS]';

// Stream timeout: if no data received for 60 seconds, abort
const STREAM_TIMEOUT_MS = 60000;

/**
 * Send a chat message and stream the response
 * @param messages - Chat history (user/assistant messages only, no system)
 * @param asrText - ASR recognition result text (included once in system message)
 * @param onChunk - Callback for each chunk received
 * @returns Promise that resolves when streaming completes
 */
export async function streamChatResponse(
  messages: ChatMessage[],
  asrText: string | null,
  onChunk: StreamCallback
): Promise<void> {
  // Check if the last user message is a special analysis request
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
  const isFillerAnalysis =
    lastUserMessage?.content.startsWith(FILLER_ANALYSIS_MARKER);
  const isPolishAnalysis =
    lastUserMessage?.content.startsWith(POLISH_ANALYSIS_MARKER);

  // Build system message based on request type
  let systemMessage: ChatMessage;
  let processedMessages = messages;

  if (isFillerAnalysis && asrText) {
    // Use specialized filler analysis prompt
    systemMessage = {
      role: 'system',
      content: buildFillerAnalysisPrompt(asrText),
    };
    // Remove the marker from the user message
    processedMessages = messages.map((m) => {
      if (m.role === 'user' && m.content.startsWith(FILLER_ANALYSIS_MARKER)) {
        return {
          ...m,
          content: m.content.slice(FILLER_ANALYSIS_MARKER.length).trim(),
        };
      }
      return m;
    });
  } else if (isPolishAnalysis && asrText) {
    // Use specialized polish analysis prompt
    systemMessage = {
      role: 'system',
      content: buildPolishAnalysisPrompt(asrText),
    };
    // Remove the marker from the user message
    processedMessages = messages.map((m) => {
      if (m.role === 'user' && m.content.startsWith(POLISH_ANALYSIS_MARKER)) {
        return {
          ...m,
          content: m.content.slice(POLISH_ANALYSIS_MARKER.length).trim(),
        };
      }
      return m;
    });
  } else {
    // Normal system message with ASR context
    systemMessage = {
      role: 'system',
      content: buildSystemMessage(asrText),
    };
  }

  // messages should only contain user/assistant, no system messages
  const fullMessages = [systemMessage, ...processedMessages];

  // Log the context being sent to LLM for debugging
  console.log('[Chat] Sending to LLM:', {
    messageCount: fullMessages.length,
    messages: fullMessages.map((m) => ({
      role: m.role,
      contentPreview:
        m.content.length > 200
          ? m.content.slice(0, 200) + '...'
          : m.content,
      contentLength: m.content.length,
    })),
  });

  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: fullMessages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = ''; // 缓冲区，处理跨 chunk 的数据

  /**
   * Process a single line from the SSE stream
   * @returns true if [DONE] signal received, false otherwise
   */
  const processLine = (line: string): boolean => {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('data: ')) {
      return false;
    }

    const data = trimmedLine.slice(6).trim();
    if (data === '[DONE]') {
      return true; // Signal completion
    }

    if (data) {
      try {
        const parsed = JSON.parse(data) as StreamChunk;
        onChunk(parsed);
      } catch (e) {
        console.warn('Failed to parse SSE chunk:', e);
      }
    }
    return false;
  };

  /**
   * Create a timeout promise that rejects after STREAM_TIMEOUT_MS
   * Returns both the promise and a cancel function
   */
  const createTimeout = () => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const promise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Stream timeout: no data received')),
        STREAM_TIMEOUT_MS
      );
    });
    const cancel = () => clearTimeout(timeoutId);
    return { promise, cancel };
  };

  try {
    while (true) {
      // Add timeout to prevent hanging indefinitely
      const timeout = createTimeout();

      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        // Race between read and timeout
        result = await Promise.race([reader.read(), timeout.promise]);
        timeout.cancel(); // Clear timeout on successful read
      } catch (timeoutError) {
        // Timeout occurred - stream is likely stuck, complete gracefully
        console.warn('Stream timeout, completing gracefully');
        return;
      }

      const { done, value } = result;

      if (done) {
        // Stream ended - process any remaining buffer before completing
        if (buffer.trim()) {
          // Buffer might contain multiple lines separated by \n
          const remainingLines = buffer.split('\n');
          for (const line of remainingLines) {
            if (processLine(line)) {
              return; // [DONE] received
            }
          }
        }
        // Stream ended normally (done=true), complete the function
        return;
      }

      // 将新数据添加到缓冲区
      buffer += decoder.decode(value, { stream: true });

      // 按行分割处理
      const lines = buffer.split('\n');
      // 最后一行可能是不完整的，保留在缓冲区
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (processLine(line)) {
          return; // [DONE] received
        }
      }
    }
  } finally {
    // 确保 reader 被释放
    reader.releaseLock();
  }
}
