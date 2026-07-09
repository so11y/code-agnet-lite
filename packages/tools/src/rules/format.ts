import type {AgentRule} from './types.js';

export function formatRuleForPrompt(rule: AgentRule): string {
  const lines = [`[Rule: ${rule.id}]`];

  if (rule.description) {
    lines.push(rule.description);
  }

  if (rule.body) {
    lines.push('', rule.body);
  }

  return lines.join('\n');
}
