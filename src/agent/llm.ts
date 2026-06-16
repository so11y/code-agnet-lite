import OpenAI from 'openai';
import {tools} from '../tools/index.js';
import {
  getOpenAiBaseUrl,
  getOpenAiModel,
  getRequiredOpenAiApiKey
} from '../utils/env.js';
import type {AgentMessage} from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function callLlm(messages: AgentMessage[]) {
  const client = new OpenAI({
    apiKey: getRequiredOpenAiApiKey(),
    baseURL: getOpenAiBaseUrl()
  });

  return client.chat.completions.create({
    model: getOpenAiModel(DEFAULT_MODEL),
    messages,
    tools: tools.map((tool) => tool.openaiTool),
    tool_choice: 'auto'
  });
}
