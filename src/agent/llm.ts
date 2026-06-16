import OpenAI from 'openai';
import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {tools} from '../tools/index.js';
import {
  getOpenAiBaseUrl,
  getOpenAiModel,
  getRequiredOpenAiApiKey
} from '../utils/env.js';
import type {AgentMessage} from './types.js';

const DEFAULT_MODEL = '';

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

export async function callLlmStream(
  messages: AgentMessage[],
  onDelta: (delta: string) => void
): Promise<ChatCompletionAssistantMessageParam> {
  const stream = await createClient().chat.completions.create({
    model: getOpenAiModel(DEFAULT_MODEL),
    messages,
    stream: true,
    tools: tools.map((tool) => tool.openaiTool),
    tool_choice: 'auto'
  });

  let content = '';
  const toolCallsByIndex = new Map<
    number,
    {id: string; name: string; arguments: string}
  >();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) {
      continue;
    }

    if (delta.content) {
      content += delta.content;
      onDelta(delta.content);
    }

    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        const index = toolCallDelta.index ?? 0;
        let toolCall = toolCallsByIndex.get(index);

        if (!toolCall) {
          toolCall = {id: '', name: '', arguments: ''};
          toolCallsByIndex.set(index, toolCall);
        }

        if (toolCallDelta.id) {
          toolCall.id = toolCallDelta.id;
        }

        if (toolCallDelta.function?.name) {
          toolCall.name += toolCallDelta.function.name;
        }

        if (toolCallDelta.function?.arguments) {
          toolCall.arguments += toolCallDelta.function.arguments;
        }
      }
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, toolCall]) => ({
      id: toolCall.id,
      type: 'function' as const,
      function: {
        name: toolCall.name,
        arguments: toolCall.arguments
      }
    }));

  return {
    role: 'assistant',
    content: content || null,
    ...(toolCalls.length ? {tool_calls: toolCalls} : {})
  };
}
