import type {z} from 'zod';
import {openAiLlm} from './provider/openai-provider.js';
import type {AgentMessage, LlmOptions} from './session-types.js';

type StructuredLlmOptions<T extends z.ZodTypeAny> = {
  messages: AgentMessage[];
  schema: T;
  llmOptions: LlmOptions;
  transform?: (parsed: z.infer<T>) => z.infer<T>;
};

export async function callStructuredLlm<T extends z.ZodTypeAny>(
  options: StructuredLlmOptions<T> & {fallback: z.infer<T>}
): Promise<z.infer<T>> {
  const result = await openAiLlm.structuredChat(
    options.messages,
    options.schema,
    options.llmOptions
  );

  if (result.value === undefined) {
    return options.fallback;
  }

  return options.transform ? options.transform(result.value) : result.value;
}

export async function callStructuredLlmOrThrow<T extends z.ZodTypeAny>(
  options: StructuredLlmOptions<T>
): Promise<z.infer<T>> {
  const result = await openAiLlm.structuredChat(
    options.messages,
    options.schema,
    options.llmOptions
  );

  if (result.value === undefined) {
    throw result.error ?? new Error('模型没有返回有效的结构化输出');
  }

  return options.transform ? options.transform(result.value) : result.value;
}

export async function callStructuredLlmWithHandler<T extends z.ZodTypeAny>(
  options: StructuredLlmOptions<T> & {
    onParseError: (text: string, error?: unknown) => z.infer<T> | undefined;
  }
): Promise<z.infer<T> | undefined> {
  const result = await openAiLlm.structuredChat(
    options.messages,
    options.schema,
    options.llmOptions
  );

  if (result.value === undefined) {
    return options.onParseError(result.text, result.error);
  }

  return options.transform ? options.transform(result.value) : result.value;
}
