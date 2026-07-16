import {z} from 'zod';
import {ROUTER_PROMPT} from './prompt.js';
import {REASONING_MODES, type ReasoningMode} from './reasoning-mode.js';
import type {AgentSession} from './session.js';
import {callStructuredLlm} from './structured-llm-caller.js';
import {formatTurnContext} from './turn-context.js';

const routeSchema = z.object({
  mode: z.enum(REASONING_MODES),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

export type ReasoningRoute = z.infer<typeof routeSchema>;

function explicitMode(input: string): ReasoningMode | undefined {
  const slashMode = input.match(/^\s*\/(dag|tot|react)\b/i)?.[1]?.toLowerCase();
  if (slashMode && REASONING_MODES.includes(slashMode as ReasoningMode)) {
    return slashMode as ReasoningMode;
  }

  if (/(?:使用|采用|启动|进入|切换到|用)\s*(?:agent\s*)?dag/i.test(input)) {
    return 'dag';
  }
  if (/(?:使用|采用|启动|进入|切换到|用)\s*(?:tot|tree of thoughts)/i.test(input)) {
    return 'tot';
  }
  if (/(?:使用|采用|启动|进入|切换到|用)\s*react/i.test(input)) {
    return 'react';
  }

  return undefined;
}

export async function routeReasoningMode(
  input: string,
  session: AgentSession
): Promise<ReasoningRoute> {
  const requested = explicitMode(input);
  if (requested) {
    return {mode: requested, confidence: 1, reason: `用户明确指定 ${requested} 模式。`};
  }

  return callStructuredLlm({
    messages: [
      {role: 'system', content: ROUTER_PROMPT},
      {
        role: 'user',
        content: formatTurnContext(session)
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
