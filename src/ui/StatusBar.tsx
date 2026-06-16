import React from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {AgentStatus, TokenUsage} from '../agent/session-types.js';
import {compactText} from '../utils/truncate.js';

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
  error: 'red'
} as const;

const statusLabel: Record<AgentStatus, string> = {
  idle: '就绪',
  thinking: '思考中',
  running_tool: '运行工具',
  done: '完成',
  error: '错误'
};

function formatStatus(status: AgentStatus, message?: string): string {
  const label = statusLabel[status];
  const detail = message ? compactText(message, 80) : '';

  if (!detail || detail === label) {
    return label;
  }

  return `${label} · ${detail}`;
}

function formatTokenUsage(usage: TokenUsage): string {
  const total = usage.total.toLocaleString('en-US');
  const prompt = usage.prompt.toLocaleString('en-US');
  const completion = usage.completion.toLocaleString('en-US');

  return `${total} tokens (in ${prompt} / out ${completion})`;
}

export function StatusBar({status, message, tokenUsage}: Props) {
  const busy = status === 'thinking' || status === 'running_tool';
  const color = statusColor[status];
  const text = formatStatus(status, message);

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
      {tokenUsage && tokenUsage.total > 0 ? (
        <Text color="gray">{formatTokenUsage(tokenUsage)}</Text>
      ) : null}
    </Box>
  );
}
