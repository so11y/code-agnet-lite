import React from 'react';
import {Box, Text} from 'ink';
import type {ChatItem, ChatRole, ToolCallItem} from '@code-agent-lite/core';
import {compactText} from '@code-agent-lite/shared';
import {PlanTodoPanel} from './PlanTodoPanel.js';
import type {PlanTodoState} from './plan-todo.js';
import type {TranscriptItem} from './transcript.js';

const MAX_TOOL_DETAIL = 2;
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

function toolStatus(call: ToolCallItem) {
  if (call.error) {
    return {label: '失败', color: 'red' as const, detail: call.error};
  }

  if (call.output) {
    return {label: '完成', color: 'green' as const, detail: call.output};
  }

  return {label: '运行中', color: 'yellow' as const};
}

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
    <Box marginTop={1} paddingLeft={2}>
      <Text color="gray">··· 另有 {count} 个工具调用</Text>
    </Box>
  );
}

function CollapsedThinkingSummary({count}: {count: number}) {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text color="gray">··· 另有 {count} 段思考</Text>
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

function findLatestThinkingKey(items: TranscriptItem[]): string | undefined {
  let messageCounter = 0;
  let latest: string | undefined;

  for (const entry of items) {
    if (entry.type !== 'message') {
      continue;
    }

    messageCounter += 1;
    if (entry.item.role === 'thinking') {
      latest = `thinking-${messageCounter}`;
    }
  }

  return latest;
}

function ThinkingBubble({message, messageKey}: {message: ChatItem; messageKey: string}) {
  const {text, omitted} = formatThinkingPreview(message.content);

  return (
    <Box key={messageKey} flexDirection="column" marginTop={1} paddingLeft={2}>
      <Text color="gray" bold>
        思考
      </Text>
      <Box borderStyle="round" borderColor="gray" paddingX={1} width="90%">
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

function ToolBubble({call, showOutput}: {call: ToolCallItem; showOutput: boolean}) {
  const state = toolStatus(call);

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={2}>
      <Text wrap="truncate">
        <Text color={state.color}>{state.label}</Text>
        <Text color="gray"> 工具 </Text>
        <Text color="yellow">{call.name}</Text>
        <Text color="gray"> {compactText(call.input, 80)}</Text>
      </Text>
      {showOutput && state.detail ? (
        <Text color={call.error ? 'red' : 'gray'} wrap="truncate">
          {compactText(state.detail, 80)}
        </Text>
      ) : null}
    </Box>
  );
}

function renderTranscriptItems(items: TranscriptItem[]) {
  const detailToolIds = pickDetailToolIds(items);
  const latestToolId = [...items].reverse().find((entry) => entry.type === 'tool')?.item.id;
  const latestThinkingKey = findLatestThinkingKey(items);
  const nodes: React.ReactNode[] = [];
  let collapsedToolCount = 0;
  let collapsedThinkingCount = 0;
  let messageCounter = 0;

  const flushCollapsedTools = (key: string) => {
    if (collapsedToolCount === 0) {
      return;
    }

    nodes.push(<CollapsedToolSummary key={key} count={collapsedToolCount} />);
    collapsedToolCount = 0;
  };

  const flushCollapsedThinking = (key: string) => {
    if (collapsedThinkingCount === 0) {
      return;
    }

    nodes.push(<CollapsedThinkingSummary key={key} count={collapsedThinkingCount} />);
    collapsedThinkingCount = 0;
  };

  const flushCollapsed = (key: string) => {
    flushCollapsedTools(`${key}-tools`);
    flushCollapsedThinking(`${key}-thinking`);
  };

  for (const [index, entry] of items.entries()) {
    if (entry.type === 'tool') {
      flushCollapsedThinking(`thinking-before-tool-${entry.item.id}`);

      if (detailToolIds.has(entry.item.id)) {
        flushCollapsedTools(`tool-before-${entry.item.id}`);
        nodes.push(
          <ToolBubble
            key={entry.item.id}
            call={entry.item}
            showOutput={entry.item.id === latestToolId && !isToolRunning(entry.item)}
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

      if (messageKey === latestThinkingKey) {
        flushCollapsedThinking(`thinking-before-${messageKey}`);
        nodes.push(<ThinkingBubble key={messageKey} message={entry.item} messageKey={messageKey} />);
      } else {
        collapsedThinkingCount += 1;
      }

      continue;
    }

    flushCollapsed(`before-message-${index}`);
    nodes.push(
      <MessageBubble
        key={messageKey}
        message={entry.item}
        messageKey={messageKey}
      />
    );
  }

  flushCollapsed('collapsed-end');
  return nodes;
}

function MessageBubble({message, messageKey}: {message: ChatItem; messageKey: string}) {
  const meta = roleMeta[message.role];
  const isUser = message.role === 'user';

  if (message.role === 'system') {
    return (
      <Box key={messageKey} marginTop={1} paddingLeft={2}>
        <Text color="gray">{message.content}</Text>
      </Box>
    );
  }

  return (
    <Box key={messageKey} flexDirection="column" alignItems={isUser ? 'flex-end' : 'flex-start'} marginTop={1}>
      <Text color={meta.color} bold>
        {meta.label}
      </Text>
      <Box borderStyle="round" borderColor={meta.color} paddingX={1} width="90%">
        <Text wrap="wrap">
          {message.content}
          {message.streaming ? <Text color="green">▌</Text> : null}
        </Text>
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
        <Box flexGrow={1} alignItems="center" justifyContent="center">
          <Text color="gray">输入问题开始对话</Text>
        </Box>
      ) : (
        renderTranscriptItems(visible)
      )}
    </Box>
  );
}
