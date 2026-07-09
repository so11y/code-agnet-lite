import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {LineNumberedBlock, limitLines} from './LineNumberedBlock.js';

const MAX_CODE_LINES = 40;

type ContentPart =
  | {type: 'text'; content: string}
  | {type: 'code'; content: string; lang: string};

function splitFencedCode(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({type: 'text', content: content.slice(lastIndex, match.index)});
    }

    const lang = match[1]?.trim() || 'text';
    parts.push({type: 'code', content: match[2] ?? '', lang});
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({type: 'text', content: content.slice(lastIndex)});
  }

  if (parts.length === 0) {
    parts.push({type: 'text', content});
  }

  return parts;
}

function InlineCode({content}: {content: string}) {
  return <Text color="cyan">{content}</Text>;
}

function renderInlineText(content: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const pattern = /`([^`\n]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Text key={key++}>{content.slice(lastIndex, match.index)}</Text>);
    }

    nodes.push(<InlineCode key={key++} content={match[1] ?? ''} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push(<Text key={key++}>{content.slice(lastIndex)}</Text>);
  }

  if (nodes.length === 0) {
    return <Text>{content}</Text>;
  }

  return <Text wrap="wrap">{nodes}</Text>;
}

function CodeBlock({content, lang}: {content: string; lang: string}) {
  const lines = limitLines(content.split('\n'), MAX_CODE_LINES);

  return (
    <LineNumberedBlock
      title={lang !== 'text' ? lang : undefined}
      lines={lines}
      marginY={1}
    />
  );
}

export function MessageContent({content, streaming}: {content: string; streaming?: boolean}) {
  const parts = useMemo(() => splitFencedCode(content), [content]);

  if (parts.length === 1 && parts[0]?.type === 'text') {
    return (
      <>
        {renderInlineText(parts[0].content)}
        {streaming ? <Text color="green">▌</Text> : null}
      </>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {parts.map((part, index) =>
        part.type === 'code' ? (
          <CodeBlock key={`code-${index}`} content={part.content} lang={part.lang} />
        ) : (
          <Box key={`text-${index}`}>{renderInlineText(part.content)}</Box>
        )
      )}
      {streaming ? <Text color="green">▌</Text> : null}
    </Box>
  );
}
