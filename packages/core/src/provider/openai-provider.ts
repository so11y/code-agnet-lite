import OpenAI from 'openai';
import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import type {ChatCompletion} from 'openai/resources/chat/completions';
import {tools} from '@code-agent-lite/tools';
import {
  getOpenAiBaseUrl,
  getOpenAiModel,
  getRequiredOpenAiApiKey,
  isThinkingEnabled
} from '@code-agent-lite/platform';
import type {AgentMessage, ChatRole, TokenUsage} from '../session-types.js';
import type {LlmCallOptions, LlmProvider, ProviderLlmStreamOptions} from './types.js';

const DEFAULT_MODEL = '';

type ReasoningMessage = {
  reasoning_content?: string | null;
};

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

function recordUsage(options: LlmCallOptions | undefined, usage?: TokenUsage) {
  if (usage) {
    options?.session?.recordTokenUsage(usage);
  }
}

function thinkingExtraBody(): {enable_thinking: boolean} | undefined {
  return isThinkingEnabled() ? {enable_thinking: true} : undefined;
}

function readReasoningContent(message: unknown): string | undefined {
  const reasoning = (message as ReasoningMessage | undefined)?.reasoning_content;
  return typeof reasoning === 'string' && reasoning.trim() ? reasoning : undefined;
}

function emitPlainReasoning(options: LlmCallOptions | undefined, message: unknown) {
  const reasoning = readReasoningContent(message);
  if (!reasoning || !options?.session) {
    return;
  }

  const session = options.session as {say?(role: ChatRole, content: string): void};
  session.say?.('thinking', reasoning);
}

let sharedClient: OpenAI | undefined;

function createClient() {
  if (!sharedClient) {
    sharedClient = new OpenAI({
      apiKey: getRequiredOpenAiApiKey(),
      baseURL: getOpenAiBaseUrl()
    });
  }

  return sharedClient;
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly kind = 'openai' as const;

  private createChatCompletion(messages: AgentMessage[], withTools: boolean) {
    const thinking = thinkingExtraBody();

    return createClient().chat.completions.create({
      model: getOpenAiModel(DEFAULT_MODEL),
      messages,
      ...(thinking ? {extra_body: thinking} : {}),
      ...(withTools
        ? {
            tools: tools.map((tool) => tool.openaiTool),
            tool_choice: 'auto' as const
          }
        : {})
    });
  }

  async chatWithTools(messages: AgentMessage[], options?: LlmCallOptions): Promise<ChatCompletion> {
    const response = await this.createChatCompletion(messages, true);
    recordUsage(options, normalizeUsage(response.usage));
    emitPlainReasoning(options, response.choices[0]?.message);
    return response;
  }

  async plainChat(messages: AgentMessage[], options?: LlmCallOptions): Promise<ChatCompletion> {
    const response = await this.createChatCompletion(messages, false);
    recordUsage(options, normalizeUsage(response.usage));
    emitPlainReasoning(options, response.choices[0]?.message);
    return response;
  }

  async streamWithTools(
    messages: AgentMessage[],
    options: ProviderLlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam> {
    const thinking = thinkingExtraBody();

    const stream = await createClient().chat.completions.create({
      model: getOpenAiModel(DEFAULT_MODEL),
      messages,
      stream: true,
      stream_options: {include_usage: true},
      ...(thinking ? {extra_body: thinking} : {}),
      tools: tools.map((tool) => tool.openaiTool),
      tool_choice: 'auto'
    });

    let content = '';
    let reasoning = '';
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

      const reasoningDelta = readReasoningContent(delta);
      if (reasoningDelta) {
        reasoning += reasoningDelta;
        options.onReasoningDelta?.(reasoningDelta);
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
      ...(reasoning ? {reasoning_content: reasoning} : {}),
      ...(toolCalls.length ? {tool_calls: toolCalls} : {})
    };
  }
}
