import {z} from 'zod';
import {ROUTER_PROMPT, formatTurnUserMessage} from './prompt.js';
import {REASONING_MODES} from './reasoning-mode.js';
import type {AgentSession} from './session.js';
import {callStructuredLlm} from './structured-llm-caller.js';

const routeSchema = z.object({
  mode: z.enum(REASONING_MODES),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

export type ReasoningRoute = z.infer<typeof routeSchema>;

export async function routeReasoningMode(input: string, session: AgentSession): Promise<ReasoningRoute> {
  return callStructuredLlm({
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
    }
  });
}
