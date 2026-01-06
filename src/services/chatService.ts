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
    return '你是一个有帮助的助手。';
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
 * Send a chat message and stream the response
 * @param messages - Chat history (user/assistant messages only, no system)
 * @param asrText - ASR recognition result text (included once in system message)
 * @param onChunk - Callback for each chunk received
 * @returns Promise that resolves when streaming completes
 */
// Filler analysis marker prefix
const FILLER_ANALYSIS_MARKER = '[FILLER_ANALYSIS]';

export async function streamChatResponse(
  messages: ChatMessage[],
  asrText: string | null,
  onChunk: StreamCallback
): Promise<void> {
  // Check if the last user message is a filler analysis request
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
  const isFillerAnalysis =
    lastUserMessage?.content.startsWith(FILLER_ANALYSIS_MARKER);

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
  } else {
    // Normal system message with ASR context
    systemMessage = {
      role: 'system',
      content: buildSystemMessage(asrText),
    };
  }

  // messages should only contain user/assistant, no system messages
  const fullMessages = [systemMessage, ...processedMessages];

  // Debug: 打印 LLM 收到的完整上下文
  console.log('=== LLM Context ===');
  console.log('ASR Text Length:', asrText?.length || 0);
  console.log('Message Count:', messages.length, '(excluding system)');
  console.log('Full Messages:', fullMessages.map(m => ({ role: m.role, content: m.content.slice(0, 100) + '...' })));
  console.log('===================');

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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          return;
        }
        try {
          const parsed = JSON.parse(data) as StreamChunk;
          onChunk(parsed);
        } catch (e) {
          // Ignore parse errors
          console.warn('Failed to parse SSE chunk:', e);
        }
      }
    }
  }
}
