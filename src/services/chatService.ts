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
  // Build system message with ASR context (ASR only appears here, once)
  const systemMessage: ChatMessage = {
    role: 'system',
    content: buildSystemMessage(asrText),
  };

  // messages should only contain user/assistant, no system messages
  const fullMessages = [systemMessage, ...messages];

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
