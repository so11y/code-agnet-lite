import React from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {AgentStatus, TokenUsage} from '@code-agent-lite/core';
import {
  contextUsageColor,
  formatContextUsagePercent,
  formatTokenCounts,
  getContextUsagePercent,
  hasTokenStats,
  isAgentBusy
} from './token-display.js';
import {compactText} from '@code-agent-lite/shared';

type Props = {
  status: AgentStatus;
  message?: string;
  tokenUsage?: TokenUsage;
};

const statusColor = {
  idle: 'gray',
  thinking: 'blue',
  running_tool: 'yellow',
  done: 'green',
  error: 'red',
  cancelled: 'magenta'
} as const;

const statusLabel: Record<AgentStatus, string> = {
  idle: '就绪',
  thinking: '思考中',
  running_tool: '运行工具',
  done: '完成',
  error: '错误',
  cancelled: '已终止'
};

function formatStatus(status: AgentStatus, message?: string): string {
  const label = statusLabel[status];
  const detail = message ? compactText(message, 80) : '';

  if (!detail || detail === label) {
    return label;
  }

  return `${label} · ${detail}`;
}

export function StatusBar({status, message, tokenUsage}: Props) {
  const busy = isAgentBusy(status);
  const color = statusColor[status];
  const text = formatStatus(status, message);
  const contextPercent = tokenUsage ? getContextUsagePercent(tokenUsage) : undefined;
  const contextLabel = tokenUsage ? formatContextUsagePercent(tokenUsage) : undefined;

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text color={color}>
        {busy ? (
          <>
            <Spinner type="dots" /> {text}
          </>
        ) : (
          text
        )}
      </Text>
      {tokenUsage && hasTokenStats(tokenUsage) ? (
        <Text color="gray">
          {contextLabel && contextPercent !== undefined ? (
            <>
              <Text color={contextUsageColor(contextPercent)} bold={contextPercent > 80}>
                {contextLabel}
              </Text>
              {' · '}
            </>
          ) : null}
          {formatTokenCounts(tokenUsage)}
        </Text>
      ) : null}
    </Box>
  );
}
