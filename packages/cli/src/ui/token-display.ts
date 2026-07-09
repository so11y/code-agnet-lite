import type {AgentStatus, TokenUsage} from '@code-agent-lite/core';
import {getContextUsagePercent, isAgentBusy} from '@code-agent-lite/core';

export {getContextUsagePercent, isAgentBusy};

export function formatContextUsagePercent(usage: TokenUsage): string | undefined {
  const percent = getContextUsagePercent(usage);

  if (percent === undefined) {
    return;
  }

  const formatted = percent >= 10 ? percent.toFixed(0) : percent.toFixed(1);

  return `${formatted}% ctx`;
}

export function contextUsageColor(percent: number): 'gray' | 'yellow' | 'red' {
  if (percent > 95) {
    return 'red';
  }

  if (percent > 80) {
    return 'yellow';
  }

  return 'gray';
}

export function formatTokenCounts(usage: TokenUsage): string {
  const total = usage.total.toLocaleString('en-US');
  const prompt = usage.prompt.toLocaleString('en-US');
  const completion = usage.completion.toLocaleString('en-US');

  return `${total} tokens (in ${prompt} / out ${completion})`;
}

export function hasTokenStats(usage: TokenUsage): boolean {
  return usage.total > 0 || (usage.contextUsed ?? 0) > 0;
}
