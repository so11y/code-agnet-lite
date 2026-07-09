import type {ChatCompletion} from 'openai/resources/chat/completions';
import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {openAiLlm} from './provider/openai-provider.js';
import type {AgentMessage, LlmOptions, LlmStreamOptions} from './session-types.js';

export async function callLlm(
  messages: AgentMessage[],
  options?: LlmOptions
): Promise<ChatCompletion> {
  return openAiLlm.chatWithTools(messages, options);
}

export async function callPlainLlm(
  messages: AgentMessage[],
  options?: LlmOptions
): Promise<ChatCompletion> {
  return openAiLlm.plainChat(messages, options);
}

export async function callLlmStream(
  messages: AgentMessage[],
  options: LlmStreamOptions
): Promise<ChatCompletionAssistantMessageParam> {
  return openAiLlm.streamWithTools(messages, options);
}
