export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
  /** 最近一次请求的 context 占用（input tokens），非累计 */
  contextUsed?: number;
  /** 当前模型的 context window 上限 */
  contextLimit?: number;
};

export function createTokenUsage(): TokenUsage {
  return {prompt: 0, completion: 0, total: 0};
}

export function getContextUsagePercent(usage: TokenUsage): number | undefined {
  const {contextUsed, contextLimit} = usage;

  if (!contextUsed || !contextLimit) {
    return;
  }

  return Math.min(100, (contextUsed / contextLimit) * 100);
}

export type TokenUsageSink = {
  recordTokenUsage(usage: TokenUsage): void;
};
