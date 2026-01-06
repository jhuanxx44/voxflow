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
 */
function buildSystemMessage(asrText: string): string {
  if (!asrText) {
    return '你是一个有帮助的助手。';
  }

  return `你是一个有帮助的助手。

以下是用户的语音识别结果（ASR转录文本），你可以基于这些内容回答用户的问题：

<asr_transcript>
${asrText}
</asr_transcript>

请注意：
- 用户可能会询问关于这段文本的问题
- 用户可能要求你总结、分析、修改或翻译这段内容
- 如果用户的问题与转录内容无关，正常回答即可`;
}

/**
 * Send a chat message and stream the response
 * @param messages - Chat history to send
 * @param asrText - ASR recognition result text (optional)
 * @param onChunk - Callback for each chunk received
 * @returns Promise that resolves when streaming completes
 */
export async function streamChatResponse(
  messages: ChatMessage[],
  asrText: string,
  onChunk: StreamCallback
): Promise<void> {
  // Build messages with system context
  const systemMessage: ChatMessage = {
    role: 'system',
    content: buildSystemMessage(asrText),
  };

  // Filter out any existing system messages and add our own
  const userMessages = messages.filter((m) => m.role !== 'system');
  const fullMessages = [systemMessage, ...userMessages];

  // Debug: 打印 LLM 收到的完整上下文
  console.log('=== LLM Context ===');
  console.log('ASR Text Length:', asrText?.length || 0);
  console.log('System Message:', systemMessage.content);
  console.log('Full Messages:', JSON.stringify(fullMessages, null, 2));
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
