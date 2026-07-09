import {z} from 'zod';
import {ROUTER_PROMPT, formatTurnUserMessage} from './prompt.js';
import type {AgentSession} from './session.js';
import {StructuredLlmCaller} from './structured-llm-caller.js';

const ROUTE_CONFIDENCE_THRESHOLD = 0.75;

const routeSchema = z.object({
  mode: z.enum(['react', 'tot', 'dag']),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

export type ReasoningRoute = z.infer<typeof routeSchema>;

export async function routeReasoningMode(input: string, session: AgentSession): Promise<ReasoningRoute> {
  return StructuredLlmCaller.call({
    messages: [
      {role: 'system', content: ROUTER_PROMPT},
      {
        role: 'user',
        content: formatTurnUserMessage(session.cwd, input)
      }
    ],
    schema: routeSchema,
    llmOptions: session.llmOptions(),
    fallback: {
      mode: 'react',
      confidence: 0,
      reason: '路由模型没有返回有效 JSON，因此默认使用 ReAct。'
    },
    transform(parsed) {
      if (parsed.mode !== 'react' && parsed.confidence >= ROUTE_CONFIDENCE_THRESHOLD) {
        return parsed;
      }

      return {
        mode: 'react' as const,
        confidence: parsed.confidence,
        reason:
          parsed.mode === 'react'
            ? parsed.reason
            : `${parsed.reason}（置信度 ${parsed.confidence.toFixed(2)} 不足，已降级为 react）`
      };
    }
  });
}
