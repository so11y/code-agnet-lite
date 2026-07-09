import {discoverRules, formatRuleForPrompt, selectMatchingRules, type AgentRule} from '@code-agent-lite/tools';
import type {AgentSession} from '../session.js';

export async function applyTurnRules(session: AgentSession, input: string, cwd: string): Promise<AgentRule[]> {
  const rules = await discoverRules(cwd);
  const matched = selectMatchingRules(rules, input, session.state);
  const injected: AgentRule[] = [];

  for (const rule of matched) {
    if (session.hasLoadedRule(rule.id)) {
      continue;
    }

    session.injectRule(rule);
    injected.push(rule);
  }

  return injected;
}
