import OpenAI from 'openai';
import type {ChatCompletion} from 'openai/resources/chat/completions';
import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {tools} from '@code-agent-lite/tools';
import {
  getOpenAiBaseUrl,
  getOpenAiModel,
  getRequiredOpenAiApiKey
} from '@code-agent-lite/platform';
import type {AgentMessage, LlmOptions, LlmStreamOptions, TokenUsage} from './session-types.js';

const DEFAULT_MODEL = '';

function normalizeUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): TokenUsage | undefined {
  if (!usage) {
    return;
  }

  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;

  return {
    prompt,
    completion,
    total: usage.total_tokens ?? prompt + completion
  };
}

function recordUsage(options: LlmOptions | undefined, usage?: TokenUsage) {
  if (usage) {
    options?.session?.recordTokenUsage(usage);
  }
}

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

export async function callLlm(
  messages: AgentMessage[],
  options?: LlmOptions
): Promise<ChatCompletion> {
  const response = await createChatCompletion(messages, true);
  recordUsage(options, normalizeUsage(response.usage));
  return response;
}

export async function callPlainLlm(
  messages: AgentMessage[],
  options?: LlmOptions
): Promise<ChatCompletion> {
  const response = await createChatCompletion(messages, false);
  recordUsage(options, normalizeUsage(response.usage));
  return response;
}

export async function callLlmStream(
  messages: AgentMessage[],
  options: LlmStreamOptions
): Promise<ChatCompletionAssistantMessageParam> {
  const stream = await createClient().chat.completions.create({
    model: getOpenAiModel(DEFAULT_MODEL),
    messages,
    stream: true,
    stream_options: {include_usage: true},
    tools: tools.map((tool) => tool.openaiTool),
    tool_choice: 'auto'
  });

  let content = '';
  let usage: TokenUsage | undefined;
  const toolCallsByIndex = new Map<
    number,
    {id: string; name: string; arguments: string}
  >();

  for await (const chunk of stream) {
    if (chunk.usage) {
      usage = normalizeUsage(chunk.usage);
    }

    const delta = chunk.choices[0]?.delta;
    if (!delta) {
      continue;
    }

    if (delta.content) {
      content += delta.content;
      options.onDelta(delta.content);
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

  recordUsage(options, usage);

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
