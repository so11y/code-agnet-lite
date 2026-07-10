import {createTwoFilesPatch} from 'diff';
import {pickStringField} from './object.js';

export type ToolDisplay =
  | {kind: 'code'; path?: string; content: string}
  | {kind: 'diff'; path?: string; content: string}
  | {kind: 'text'; content: string};

export const READ_FILE_DISPLAY_MAX_LINES = 24;

export function limitLines(
  lines: string[],
  maxLines: number,
  omittedMessage = (omitted: number) => `··· 已省略 ${omitted} 行`
): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines), omittedMessage(lines.length - maxLines)];
}

export type ToolResult = string | {output: string; display?: ToolDisplay};

export function limitDisplayLines(content: string, maxLines = READ_FILE_DISPLAY_MAX_LINES): string {
  return limitLines(content.split('\n'), maxLines).join('\n');
}

export function normalizeToolResult(result: ToolResult): {output: string; display?: ToolDisplay} {
  if (typeof result === 'string') {
    return {output: result};
  }

  const display = result.display ?? undefined;
  return {output: result.output, display: display || undefined};
}

export function toolInputPath(input: unknown): string | undefined {
  return pickStringField(input, 'path');
}

export function buildSyntheticDiff(path: string, before: string, after: string): string {
  if (before === after) {
    return '无变更。';
  }

  return createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after, undefined, undefined, {
    context: 3
  }).trim();
}

export function inferToolDisplay(name: string, output: string, input?: unknown): ToolDisplay | undefined {
  const baseName = name.includes(':') ? name.split(':').at(-1)! : name;
  const path = toolInputPath(input);

  switch (baseName) {
    case 'read_file':
      return output ? {kind: 'code', path, content: limitDisplayLines(output)} : undefined;
    default:
      return undefined;
  }
}
