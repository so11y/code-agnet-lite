import OpenAI from 'openai';
import {tools} from '../tools/index.js';
import {
  getOpenAiBaseUrl,
  getOpenAiModel,
  getRequiredOpenAiApiKey
} from '../utils/env.js';
import type {AgentMessage} from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

function createClient() {
  return new OpenAI({
    apiKey: getRequiredOpenAiApiKey(),
    baseURL: getOpenAiBaseUrl()
  });
}

function createChatCompletion(messages: AgentMessage[], withTools: boolean) {
  return createClient().chat.completions.create({
    model: getOpenAiModel(DEFAULT_MODEL),
    messages,
    ...(withTools
      ? {
          tools: tools.map((tool) => tool.openaiTool),
          tool_choice: 'auto' as const
        }
      : {})
  });
}

export async function callLlm(messages: AgentMessage[]) {
  return createChatCompletion(messages, true);
}

export async function callPlainLlm(messages: AgentMessage[]) {
  return createChatCompletion(messages, false);
}
