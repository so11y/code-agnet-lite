export type ToolDisplay =
  | {kind: 'code'; path?: string; content: string}
  | {kind: 'diff'; path?: string; content: string}
  | {kind: 'text'; content: string};

export const READ_FILE_DISPLAY_MAX_LINES = 24;

export type ToolResult = string | {output: string; display?: ToolDisplay};

export function limitDisplayLines(content: string, maxLines = READ_FILE_DISPLAY_MAX_LINES): string {
  const lines = content.split('\n');

  if (lines.length <= maxLines) {
    return content;
  }

  return [...lines.slice(0, maxLines), `··· 已省略 ${lines.length - maxLines} 行`].join('\n');
}

export function normalizeToolResult(result: ToolResult): {output: string; display?: ToolDisplay} {
  if (typeof result === 'string') {
    return {output: result};
  }

  const display = result.display ?? undefined;
  return {output: result.output, display: display || undefined};
}

export function toolInputPath(input: unknown): string | undefined {
  if (input && typeof input === 'object' && 'path' in input && typeof input.path === 'string') {
    return input.path;
  }

  return undefined;
}

export function buildSyntheticDiff(path: string, before: string, after: string): string {
  if (before === after) {
    return '无变更。';
  }

  const lines = [`--- a/${path}`, `+++ b/${path}`];

  if (!before) {
    for (const line of after.split('\n')) {
      lines.push(`+${line}`);
    }
    return lines.join('\n');
  }

  if (!after) {
    for (const line of before.split('\n')) {
      lines.push(`-${line}`);
    }
    return lines.join('\n');
  }

  for (const line of before.split('\n')) {
    lines.push(`-${line}`);
  }

  for (const line of after.split('\n')) {
    lines.push(`+${line}`);
  }

  return lines.join('\n');
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
