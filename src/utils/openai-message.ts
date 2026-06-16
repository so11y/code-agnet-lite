import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageToolCall
} from 'openai/resources/chat/completions';
import {truncate} from './truncate.js';

export function messageText(content: ChatCompletionAssistantMessageParam['content']) {
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
      `LLM response is not OpenAI-compatible: missing choices array. Raw response: ${truncate(
        JSON.stringify(response)
      )}`
    );
  }

  const message = response.choices[0]?.message;
  if (!message) {
    throw new Error(`Model returned no assistant message. Raw response: ${truncate(JSON.stringify(response))}`);
  }

  return message;
}
