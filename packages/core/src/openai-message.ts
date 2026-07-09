import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from 'openai/resources/chat/completions';
import {z} from 'zod';
import {parseJsonObject, truncate} from '@code-agent-lite/shared';

export function messageText(content: ChatCompletionMessageParam['content']) {
  if (!content) {
    return;
  }

  return typeof content === 'string' ? content : JSON.stringify(content);
}

export function parseToolArgs(toolCall: ChatCompletionMessageToolCall) {
  try {
    return JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return {};
  }
}

export function getAssistantMessage(response: ChatCompletion) {
  if (!Array.isArray(response.choices)) {
    throw new Error(
      `LLM 响应不符合 OpenAI 格式：缺少 choices 数组。原始响应：${truncate(
        JSON.stringify(response)
      )}`
    );
  }

  const message = response.choices[0]?.message;
  if (!message) {
    throw new Error(`模型未返回 assistant 消息。原始响应：${truncate(JSON.stringify(response))}`);
  }

  return message;
}

export function extractAssistantText(response: ChatCompletion): string {
  return messageText(getAssistantMessage(response).content) ?? '';
}

export function parseAssistantJson<T extends z.ZodTypeAny>(
  response: ChatCompletion,
  schema: T
): z.infer<T> {
  return schema.parse(parseJsonObject(extractAssistantText(response)));
}

export function agentMessageText(message: ChatCompletionMessageParam): string {
  const content = messageText(message.content);
  if (content) {
    return content;
  }

  if ('tool_calls' in message && message.tool_calls?.length) {
    return `工具调用：${message.tool_calls.map((call) => call.function.name).join('、')}`;
  }

  return '';
}

export function formatSessionTranscript(messages: ChatCompletionMessageParam[]): string {
  return messages
    .map((message) => `${message.role}: ${agentMessageText(message)}`)
    .filter((line) => line.trim())
    .join('\n');
}
