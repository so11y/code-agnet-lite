import React from 'react';
import {Box, Text} from 'ink';

export function limitLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines), `··· 已截断，仅显示前 ${maxLines} 行`];
}

type Props = {
  title?: string;
  lines: string[];
  renderLine?(line: string): React.ReactNode;
  marginY?: number;
};

export function LineNumberedBlock({title, lines, renderLine, marginY}: Props) {
  const gutterWidth = Math.max(2, String(lines.length).length);

  return (
    <Box
      marginY={marginY}
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      width="100%"
    >
      {title ? (
        <Text color="gray" dimColor>
          {title}
        </Text>
      ) : null}
      {lines.map((line, index) => (
        <Text key={`${index}-${line.length}`} wrap="truncate">
          <Text dimColor>{String(index + 1).padStart(gutterWidth)} </Text>
          {renderLine ? renderLine(line) : line}
        </Text>
      ))}
    </Box>
  );
}
