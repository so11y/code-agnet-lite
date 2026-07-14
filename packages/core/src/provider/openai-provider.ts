import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam
} from 'openai/resources/chat/completions';
import type {AgentTool} from '@code-agent-lite/tools';
import {createDefaultToolRegistry} from '../tool-registry.js';
import {
  getOpenAiBaseUrl,
  getOpenAiModel,
  getRequiredOpenAiApiKey,
  isThinkingEnabled
} from '@code-agent-lite/platform';
import type {AgentMessage, TokenUsage} from '../session-types.js';
import {normalizeOpenAiUsage} from './token-usage.js';
import type {LlmOptions, LlmProvider, LlmStreamOptions} from './types.js';

const DEFAULT_MODEL = '';

type ReasoningMessage = {
  reasoning_content?: string | null;
};

function thinkingExtraBody(): {enable_thinking: boolean} | undefined {
  return isThinkingEnabled() ? {enable_thinking: true} : undefined;
}

function readReasoningContent(message: unknown): string | undefined {
  const reasoning = (message as ReasoningMessage | undefined)?.reasoning_content;
  return typeof reasoning === 'string' && reasoning.trim() ? reasoning : undefined;
}

function emitPlainReasoning(session: LlmOptions['session'], message: unknown) {
  const reasoning = readReasoningContent(message);
  if (!reasoning || !session) {
    return;
  }

  session.events.say('thinking', reasoning);
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

function resolveTools(session: LlmOptions['session']): readonly AgentTool[] {
  return session ? session.toolRegistry.tools : createDefaultToolRegistry().tools;
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly kind = 'openai' as const;

  private createChatCompletion(messages: AgentMessage[], withTools: boolean, options?: LlmOptions) {
    const thinking = thinkingExtraBody();
    const toolList = resolveTools(options?.session);

    return createClient().chat.completions.create(
      {
        model: getOpenAiModel(DEFAULT_MODEL),
        messages,
        ...(thinking ? {extra_body: thinking} : {}),
        ...(withTools
          ? {
              tools: toolList.map((tool) => tool.openaiTool),
              tool_choice: 'auto' as const
            }
          : {})
      },
      options?.signal ? {signal: options.signal} : undefined
    );
  }

  private async completeChat(
    messages: AgentMessage[],
    withTools: boolean,
    options?: LlmOptions
  ): Promise<ChatCompletion> {
    const response = await this.createChatCompletion(messages, withTools, options);
    const usage = normalizeOpenAiUsage(response.usage);
    if (usage && options?.session) {
      options.session.events.recordTokenUsage(usage);
    }
    emitPlainReasoning(options?.session, response.choices[0]?.message);
    return response;
  }

  async chatWithTools(messages: AgentMessage[], options?: LlmOptions): Promise<ChatCompletion> {
    return this.completeChat(messages, true, options);
  }

  async plainChat(messages: AgentMessage[], options?: LlmOptions): Promise<ChatCompletion> {
    return this.completeChat(messages, false, options);
  }

  async streamWithTools(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam> {
    const thinking = thinkingExtraBody();
    const toolList = resolveTools(options.session);

    const stream = await createClient().chat.completions.create(
      {
        model: getOpenAiModel(DEFAULT_MODEL),
        messages,
        stream: true,
        stream_options: {include_usage: true},
        ...(thinking ? {extra_body: thinking} : {}),
        tools: toolList.map((tool) => tool.openaiTool),
        tool_choice: 'auto'
      },
      options.signal ? {signal: options.signal} : undefined
    );

    let content = '';
    let reasoning = '';
    let usage: TokenUsage | undefined;
    const toolCallsByIndex = new Map<
      number,
      {id: string; name: string; arguments: string}
    >();

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = normalizeOpenAiUsage(chunk.usage);
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

    if (usage && options.session) {
      options.session.events.recordTokenUsage(usage);
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
      ...(reasoning ? {reasoning_content: reasoning} : {}),
      ...(toolCalls.length ? {tool_calls: toolCalls} : {})
    };
  }
}

export const openAiLlm = new OpenAiLlmProvider();
