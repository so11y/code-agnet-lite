import type {z} from 'zod';
import type {AgentProviderKind} from '@code-agent-lite/platform';
import type {AgentMessage, AssistantMessage, LlmOptions, LlmStreamOptions} from '../types/llm.js';
import type {TokenUsageSink} from '../types/token.js';
import type {CursorSdkTokenUsage} from './token-usage.js';

export type {AgentProviderKind};

export type StructuredLlmResult<T> = {
  text: string;
  value?: T;
  error?: unknown;
};

/** OpenAI 兼容的 chat 后端，供 router / planner / ReAct 使用 */
export interface LlmProvider {
  readonly kind: Extract<AgentProviderKind, 'openai'>;
  streamWithTools(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<AssistantMessage>;
  plainChat(messages: AgentMessage[], options?: LlmOptions): Promise<string>;
  structuredChat<TSchema extends z.ZodTypeAny>(
    messages: AgentMessage[],
    schema: TSchema,
    options?: LlmOptions
  ): Promise<StructuredLlmResult<z.infer<TSchema>>>;
}

export type CursorAgentHandle = {
  send(prompt: string): Promise<CursorRunHandle>;
  dispose(): Promise<void>;
};

export type {CursorSdkTokenUsage} from './token-usage.js';

export type CursorRunStatus = 'completed' | 'error' | (string & {});

export type CursorRunHandle = {
  stream(): AsyncIterable<unknown>;
  wait(): Promise<{status: CursorRunStatus; result?: string; id?: string; usage?: CursorSdkTokenUsage}>;
};

export type {AgentMessage, LlmOptions, LlmStreamOptions, TokenUsageSink};
