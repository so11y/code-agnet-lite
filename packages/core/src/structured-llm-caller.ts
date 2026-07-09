import type {ChatCompletion} from 'openai/resources/chat/completions';
import type {z} from 'zod';
import {callPlainLlm} from './llm.js';
import {parseAssistantJson} from './openai-message.js';
import type {AgentMessage, LlmOptions} from './session-types.js';

export class StructuredLlmCaller {
  static async call<T extends z.ZodTypeAny>(options: {
    messages: AgentMessage[];
    schema: T;
    llmOptions: LlmOptions;
    fallback: z.infer<T>;
    transform?: (parsed: z.infer<T>) => z.infer<T>;
  }): Promise<z.infer<T>> {
    const response = await callPlainLlm(options.messages, options.llmOptions);

    try {
      const parsed = parseAssistantJson(response, options.schema);
      return options.transform ? options.transform(parsed) : parsed;
    } catch {
      return options.fallback;
    }
  }

  static async callOrThrow<T extends z.ZodTypeAny>(options: {
    messages: AgentMessage[];
    schema: T;
    llmOptions: LlmOptions;
    transform?: (parsed: z.infer<T>) => z.infer<T>;
  }): Promise<z.infer<T>> {
    const response = await callPlainLlm(options.messages, options.llmOptions);
    const parsed = parseAssistantJson(response, options.schema);
    return options.transform ? options.transform(parsed) : parsed;
  }

  static async callWithHandler<T extends z.ZodTypeAny>(options: {
    messages: AgentMessage[];
    schema: T;
    llmOptions: LlmOptions;
    onParseError: (response: ChatCompletion) => z.infer<T> | undefined;
  }): Promise<z.infer<T> | undefined> {
    const response = await callPlainLlm(options.messages, options.llmOptions);

    try {
      return parseAssistantJson(response, options.schema);
    } catch {
      return options.onParseError(response);
    }
  }
}
