import type {ChatCompletion} from 'openai/resources/chat/completions';
import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {getLlmProvider} from './provider/factory.js';
import type {AgentMessage, LlmOptions, LlmStreamOptions} from './session-types.js';

export async function callLlm(
  messages: AgentMessage[],
  options?: LlmOptions
): Promise<ChatCompletion> {
  return getLlmProvider().chatWithTools(messages, options);
}

export async function callPlainLlm(
  messages: AgentMessage[],
  options?: LlmOptions
): Promise<ChatCompletion> {
  return getLlmProvider().plainChat(messages, options);
}

export async function callLlmStream(
  messages: AgentMessage[],
  options: LlmStreamOptions
): Promise<ChatCompletionAssistantMessageParam> {
  return getLlmProvider().streamWithTools(messages, options);
}
