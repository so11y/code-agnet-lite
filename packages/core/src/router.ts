import {z} from 'zod';
import {parseAssistantJson} from './openai-message.js';
import {callPlainLlm} from './llm.js';
import {ROUTER_PROMPT} from './prompt.js';
import type {AgentSession} from './session.js';

const routeSchema = z.object({
  mode: z.enum(['react', 'tot']),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

export type ReasoningRoute = z.infer<typeof routeSchema>;
export type ReasoningMode = ReasoningRoute['mode'];

export async function routeReasoningMode(input: string, session: AgentSession): Promise<ReasoningRoute> {
  const response = await callPlainLlm(
    [
      {role: 'system', content: ROUTER_PROMPT},
      {
        role: 'user',
        content: `当前工作区：${session.cwd}\n\n用户请求：\n${input}`
      }
    ],
    session.llmOptions()
  );

  try {
    const parsed = parseAssistantJson(response, routeSchema);
    return parsed.mode === 'tot' && parsed.confidence >= 0.75
      ? parsed
      : {
          ...parsed,
          mode: 'react'
        };
  } catch {
    return {
      mode: 'react',
      confidence: 0,
      reason: '路由模型没有返回有效 JSON，因此默认使用 ReAct。'
    };
  }
}
