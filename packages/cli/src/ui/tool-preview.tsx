import {Box, Text} from 'ink';
import type {ToolCallItem, ToolDisplay} from '@code-agent-lite/core';
import {toolInputPath} from '@code-agent-lite/shared';
import {LineNumberedBlock} from './LineNumberedBlock.js';

function DiffLine({line}: {line: string}) {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return <Text bold>{line}</Text>;
  }

  if (line.startsWith('@@')) {
    return <Text color="cyan">{line}</Text>;
  }

  if (line.startsWith('+')) {
    return <Text color="green">{line}</Text>;
  }

  if (line.startsWith('-')) {
    return <Text color="red">{line}</Text>;
  }

  if (line.startsWith('diff --git') || line.startsWith('index ')) {
    return <Text color="gray">{line}</Text>;
  }

  return <Text dimColor>{line}</Text>;
}

function CodePreview({display}: {display: Extract<ToolDisplay, {kind: 'code'}>}) {
  return <LineNumberedBlock title={display.path} lines={display.content.split('\n')} />;
}

function DiffPreview({display}: {display: Extract<ToolDisplay, {kind: 'diff'}>}) {
  const content = display.content.trim();

  if (!content || content === '无变更。') {
    return <Text color="gray">{content || '无变更。'}</Text>;
  }

  return (
    <LineNumberedBlock
      title={display.path}
      lines={content.split('\n')}
      renderLine={(line) => <DiffLine line={line} />}
    />
  );
}

function TextPreview({display, isError}: {display: Extract<ToolDisplay, {kind: 'text'}>; isError?: boolean}) {
  return (
    <Box flexDirection="column" width="100%">
      {display.content.split('\n').map((line, index) => (
        <Text key={`${index}-${line.length}`} color={isError ? 'red' : 'gray'} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function ToolOutputPreview({call}: {call: ToolCallItem}) {
  const display = call.display;

  if (!display) {
    return null;
  }

  switch (display.kind) {
    case 'code':
      return <CodePreview display={display} />;
    case 'diff':
      return <DiffPreview display={display} />;
    case 'text':
      return <TextPreview display={display} isError={Boolean(call.error)} />;
    default:
      return null;
  }
}

export function ToolBubbleBody({
  call,
  showOutput
}: {
  call: ToolCallItem;
  showOutput: boolean;
}) {
  const stateLabel = call.error ? '失败' : call.output ? '完成' : '运行中';
  const stateColor = call.error ? 'red' : call.output ? 'green' : 'yellow';
  const path = call.display && 'path' in call.display ? call.display.path : toolInputPath(call.input);

  return (
    <Box flexDirection="column" marginTop={1} width="100%">
      <Text wrap="truncate">
        <Text color={stateColor}>{stateLabel}</Text>
        <Text color="gray"> 工具 </Text>
        <Text color="yellow">{call.name}</Text>
        {path ? <Text color="gray"> {path}</Text> : null}
      </Text>
      {showOutput && call.display ? (
        <Box marginTop={1} flexDirection="column" width="100%">
          <ToolOutputPreview call={call} />
        </Box>
      ) : null}
    </Box>
  );
}
