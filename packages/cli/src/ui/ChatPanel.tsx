import React from 'react';
import {Box, Text} from 'ink';
import type {ChatItem, ChatRole, ToolCallItem} from '@code-agent-lite/core';
import {PlanTodoPanel} from './PlanTodoPanel.js';
import type {PlanTodoState} from './plan-todo.js';
import type {TranscriptItem} from './transcript.js';
import {WelcomeHints} from './WelcomeHints.js';
import {MessageContent} from './message-content.js';
import {ToolBubbleBody} from './tool-preview.js';

const MAX_TOOL_DETAIL = 1;
const THINKING_MAX_LINES = 4;

type Props = {
  items: TranscriptItem[];
  plan?: PlanTodoState;
};

const roleMeta: Record<ChatRole, {label: string; color: 'cyan' | 'green' | 'gray' | 'yellow'}> = {
  user: {label: '你', color: 'cyan'},
  assistant: {label: '助手', color: 'green'},
  system: {label: '系统', color: 'gray'},
  tool: {label: '工具', color: 'yellow'},
  thinking: {label: '思考', color: 'gray'}
};

function isToolRunning(call: ToolCallItem): boolean {
  return !call.output && !call.error;
}

function pickDetailToolIds(items: TranscriptItem[]): Set<string> {
  const tools = items.filter((entry): entry is {type: 'tool'; item: ToolCallItem} => entry.type === 'tool');
  const detailIds = new Set<string>();
  const running = tools.find((entry) => isToolRunning(entry.item));

  if (running) {
    detailIds.add(running.item.id);
  }

  const completed = tools.filter((entry) => !isToolRunning(entry.item));
  const slots = running ? MAX_TOOL_DETAIL - 1 : MAX_TOOL_DETAIL;
  for (const entry of completed.slice(-slots)) {
    detailIds.add(entry.item.id);
  }

  return detailIds;
}

function CollapsedToolSummary({count}: {count: number}) {
  return (
    <Box marginTop={1}>
      <Text color="gray">··· 另有 {count} 个工具调用</Text>
    </Box>
  );
}

function formatThinkingPreview(content: string): {text: string; omitted: number} {
  const lines = content.split('\n');

  if (lines.length <= THINKING_MAX_LINES) {
    return {text: content, omitted: 0};
  }

  return {
    text: lines.slice(-THINKING_MAX_LINES).join('\n'),
    omitted: lines.length - THINKING_MAX_LINES
  };
}

function ThinkingBubble({message, messageKey}: {message: ChatItem; messageKey: string}) {
  const {text, omitted} = formatThinkingPreview(message.content);

  return (
    <Box key={messageKey} flexDirection="column" marginTop={1} width="100%">
      <Text color="gray" bold>
        思考
      </Text>
      <Box borderStyle="round" borderColor="gray" paddingX={1} width="100%" flexDirection="column">
        {omitted > 0 ? (
          <Text color="gray" dimColor>
            ··· 已省略 {omitted} 行
          </Text>
        ) : null}
        <Text wrap="wrap" dimColor>
          {text}
          {message.streaming ? <Text color="gray">▌</Text> : null}
        </Text>
      </Box>
    </Box>
  );
}

function renderTranscriptItems(items: TranscriptItem[]) {
  const detailToolIds = pickDetailToolIds(items);
  const latestToolId = [...items].reverse().find((entry) => entry.type === 'tool')?.item.id;
  const nodes: React.ReactNode[] = [];
  let collapsedToolCount = 0;
  let messageCounter = 0;

  const flushCollapsedTools = (key: string) => {
    if (collapsedToolCount === 0) {
      return;
    }

    nodes.push(<CollapsedToolSummary key={key} count={collapsedToolCount} />);
    collapsedToolCount = 0;
  };

  for (const [index, entry] of items.entries()) {
    if (entry.type === 'tool') {
      if (detailToolIds.has(entry.item.id)) {
        flushCollapsedTools(`tool-before-${entry.item.id}`);
        nodes.push(
          <ToolBubbleBody
            key={entry.item.id}
            call={entry.item}
            showOutput={!isToolRunning(entry.item) && entry.item.id === latestToolId}
          />
        );
        continue;
      }

      collapsedToolCount += 1;
      continue;
    }

    messageCounter += 1;
    const messageKey = `${entry.item.role}-${messageCounter}`;

    if (entry.item.role === 'thinking') {
      flushCollapsedTools(`tools-before-${messageKey}`);

      if (entry.item.content.trim() || entry.item.streaming) {
        nodes.push(<ThinkingBubble key={messageKey} message={entry.item} messageKey={messageKey} />);
      }

      continue;
    }

    flushCollapsedTools(`before-message-${index}-tools`);
    nodes.push(
      <MessageBubble
        key={messageKey}
        message={entry.item}
        messageKey={messageKey}
      />
    );
  }

  flushCollapsedTools('collapsed-end');
  return nodes;
}

function MessageBubble({message, messageKey}: {message: ChatItem; messageKey: string}) {
  const meta = roleMeta[message.role];

  if (message.role === 'system') {
    return (
      <Box key={messageKey} marginTop={1}>
        <Text color="gray">{message.content}</Text>
      </Box>
    );
  }

  return (
    <Box key={messageKey} flexDirection="column" marginTop={1} width="100%">
      <Text color={meta.color} bold>
        {meta.label}
      </Text>
      <Box borderStyle="round" borderColor={meta.color} paddingX={1} width="100%">
        <MessageContent content={message.content} streaming={message.streaming} />
      </Box>
    </Box>
  );
}

export function ChatPanel({items, plan}: Props) {
  const visible = items.slice(-16);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1} minHeight={12}>
      {plan ? <PlanTodoPanel plan={plan} /> : null}
      {visible.length === 0 && !plan ? (
        <WelcomeHints />
      ) : (
        renderTranscriptItems(visible)
      )}
    </Box>
  );
}
