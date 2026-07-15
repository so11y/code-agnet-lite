import {createOpenAI} from '@ai-sdk/openai';
import type {AgentTool} from '@code-agent-lite/tools';
import {
  Output,
  generateText,
  streamText,
  tool,
  type LanguageModel,
  type ToolSet
} from 'ai';
import {z} from 'zod';
import {
  getOpenAiBaseUrl,
  getOpenAiModel,
  getRequiredOpenAiApiKey,
  isThinkingEnabled
} from '@code-agent-lite/platform';
import {createDefaultToolRegistry} from '../tool-registry.js';
import type {AgentMessage, AssistantMessage, ToolCall} from '../session-types.js';
import {normalizeAiSdkUsage, recordTokenUsage} from './token-usage.js';
import type {
  LlmOptions,
  LlmProvider,
  LlmStreamOptions,
  StructuredLlmResult
} from './types.js';

async function fetchWithThinking(input: RequestInfo | URL, init?: RequestInit) {
  if (!isThinkingEnabled() || typeof init?.body !== 'string') {
    return globalThis.fetch(input, init);
  }

  try {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    return globalThis.fetch(input, {
      ...init,
      body: JSON.stringify({...body, enable_thinking: true})
    });
  } catch {
    return globalThis.fetch(input, init);
  }
}

function createDefaultModel(): LanguageModel {
  return createOpenAI({
    apiKey: getRequiredOpenAiApiKey(),
    baseURL: getOpenAiBaseUrl(),
    fetch: fetchWithThinking
  }).chat(getOpenAiModel());
}

function resolveTools(session: LlmOptions['session']): ToolSet {
  const tools = session ? session.toolRegistry.tools : createDefaultToolRegistry().tools;
  return Object.fromEntries(
    tools.map((agentTool: AgentTool) => [
      agentTool.name,
      tool({description: agentTool.description, inputSchema: agentTool.schema})
    ])
  );
}

function toToolCall(id: string, name: string, input: unknown): ToolCall {
  return {type: 'tool-call', toolCallId: id, toolName: name, input};
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly kind = 'openai' as const;

  constructor(private readonly modelOverride?: LanguageModel) {}

  private model() {
    return this.modelOverride ?? createDefaultModel();
  }

  private recordUsage(
    options: LlmOptions | undefined,
    usage: Parameters<typeof normalizeAiSdkUsage>[0]
  ) {
    recordTokenUsage(options?.session?.events, normalizeAiSdkUsage(usage));
  }

  private emitReasoning(options: LlmOptions | undefined, reasoning?: string) {
    if (reasoning && options?.session) {
      options.session.events.say('thinking', reasoning);
    }
  }

  async plainChat(messages: AgentMessage[], options?: LlmOptions): Promise<string> {
    const result = await generateText({
      model: this.model(),
      messages,
      allowSystemInMessages: true,
      abortSignal: options?.signal
    });

    this.recordUsage(options, result.usage);
    this.emitReasoning(options, result.reasoningText);
    return result.text;
  }

  async structuredChat<TSchema extends z.ZodTypeAny>(
    messages: AgentMessage[],
    schema: TSchema,
    options?: LlmOptions
  ): Promise<StructuredLlmResult<z.infer<TSchema>>> {
    const result = await generateText({
      model: this.model(),
      messages,
      allowSystemInMessages: true,
      output: Output.object({schema}),
      abortSignal: options?.signal
    });

    this.recordUsage(options, result.usage);
    this.emitReasoning(options, result.reasoningText);

    try {
      return {text: result.text, value: result.output as z.infer<TSchema>};
    } catch (error) {
      return {text: result.text, error};
    }
  }

  async streamWithTools(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<AssistantMessage> {
    const result = streamText({
      model: this.model(),
      messages,
      allowSystemInMessages: true,
      tools: resolveTools(options.session),
      toolChoice: 'auto',
      abortSignal: options.signal
    });

    let text = '';
    let reasoning = '';
    const toolCalls: ToolCall[] = [];

    for await (const part of result.stream) {
      switch (part.type) {
        case 'text-delta':
          text += part.text;
          options.onDelta(part.text);
          break;
        case 'reasoning-delta':
          reasoning += part.text;
          options.onReasoningDelta?.(part.text);
          break;
        case 'tool-call':
          toolCalls.push(toToolCall(part.toolCallId, part.toolName, part.input));
          break;
        case 'error':
          throw part.error;
      }
    }

    this.recordUsage(options, await result.usage);

    const finalText = text || (await result.text);
    const finalReasoning = reasoning || (await result.reasoningText) || '';
    const finalToolCalls = toolCalls.length
      ? toolCalls
      : (await result.toolCalls).map((call) =>
          toToolCall(call.toolCallId, call.toolName, call.input)
        );

    if (finalReasoning && !reasoning) {
      options.onReasoningDelta?.(finalReasoning);
    }

    return {
      role: 'assistant',
      content: finalToolCalls.length
        ? [...(finalText ? [{type: 'text' as const, text: finalText}] : []), ...finalToolCalls]
        : finalText
    };
  }
}

export const openAiLlm = new OpenAiLlmProvider();
