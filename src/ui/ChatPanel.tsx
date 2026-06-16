import React from 'react';
import {Box, Text} from 'ink';
import type {ChatItem, ChatRole, ToolCallItem} from '../agent/types.js';
import {compactText} from '../utils/truncate.js';
import type {TranscriptItem} from './transcript.js';

type Props = {
  items: TranscriptItem[];
};

const roleMeta: Record<ChatRole, {label: string; color: 'cyan' | 'green' | 'gray' | 'yellow'}> = {
  user: {label: 'You', color: 'cyan'},
  assistant: {label: 'Agent', color: 'green'},
  system: {label: 'System', color: 'gray'},
  tool: {label: 'Tool', color: 'yellow'}
};

function toolStatus(call: ToolCallItem) {
  if (call.error) {
    return {label: 'failed', color: 'red' as const, detail: call.error};
  }

  if (call.output) {
    return {label: 'done', color: 'green' as const, detail: call.output};
  }

  return {label: 'running', color: 'yellow' as const};
}

function ToolBubble({call}: {call: ToolCallItem}) {
  const state = toolStatus(call);

  return (
    <Box key={call.id} flexDirection="column" marginTop={1} paddingLeft={2}>
      <Text>
        <Text color={state.color}>{state.label}</Text>
        <Text color="gray"> tool </Text>
        <Text color="yellow">{call.name}</Text>
        <Text color="gray"> {compactText(call.input)}</Text>
      </Text>
      {state.detail ? (
        <Text color={call.error ? 'red' : 'gray'} wrap="truncate">
          {compactText(state.detail)}
        </Text>
      ) : null}
    </Box>
  );
}

function MessageBubble({message}: {message: ChatItem}) {
  const meta = roleMeta[message.role];
  const isUser = message.role === 'user';

  if (message.role === 'system') {
    return (
      <Box marginTop={1} paddingLeft={2}>
        <Text color="gray">{message.content}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" alignItems={isUser ? 'flex-end' : 'flex-start'} marginTop={1}>
      <Text color={meta.color} bold>
        {meta.label}
      </Text>
      <Box
        borderStyle="round"
        borderColor={meta.color}
        paddingX={1}
        width="90%"
      >
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    </Box>
  );
}

export function ChatPanel({items}: Props) {
  const visible = items.slice(-16);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      minHeight={12}
    >
      {visible.length === 0 ? (
        <Box flexGrow={1} alignItems="center" justifyContent="center">
          <Text color="gray">Send a task to start chatting with the agent.</Text>
        </Box>
      ) : (
        visible.map((entry, index) =>
          entry.type === 'tool' ? (
            <ToolBubble key={entry.item.id} call={entry.item} />
          ) : (
            <MessageBubble key={`${entry.item.role}-${index}`} message={entry.item} />
          )
        )
      )}
    </Box>
  );
}
