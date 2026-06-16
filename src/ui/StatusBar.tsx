import React from 'react';
import {Box, Text} from 'ink';
import type {AgentStatus} from '../agent/types.js';
import {compactText} from '../utils/truncate.js';

type Props = {
  status: AgentStatus;
  message?: string;
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

export function StatusBar({status, message}: Props) {
  return (
    <Box paddingX={1}>
      <Text color={statusColor[status]}>{formatStatus(status, message)}</Text>
    </Box>
  );
}
