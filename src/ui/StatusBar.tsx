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

export function StatusBar({status, message}: Props) {
  const displayMessage = message ? compactText(message, 100) : 'Ready';

  return (
    <Box paddingX={1}>
      <Text color={statusColor[status]}>{status}</Text>
      <Text color="gray">  {displayMessage}</Text>
    </Box>
  );
}
