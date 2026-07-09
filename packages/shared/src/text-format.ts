import {compact} from 'lodash-es';

export function formatList(title: string, items: string[]): string {
  if (!items.length) {
    return '';
  }

  return `${title}\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
}

export function joinSections(...parts: Array<string | false | undefined | null>): string {
  return compact(parts).join('\n\n');
}

export function formatOperationSection(label: string, items: string[]): string {
  return items.length ? formatList(label, items) : `${label}（无）`;
}

type VerifyFailureBlock = {
  command: string;
  exitCode: number;
  output: string;
};

export function formatVerifyFailureBlock(
  failure: VerifyFailureBlock,
  options?: {style?: 'heading' | 'bullet'; maxOutputLen?: number}
): string {
  const output = options?.maxOutputLen ? failure.output.slice(0, options.maxOutputLen) : failure.output;

  if (options?.style === 'bullet') {
    return `- **${failure.command}** → 退出码 **${failure.exitCode}**\n\`\`\`\n${output}\n\`\`\``;
  }

  return `### 命令: \`${failure.command}\`\n退出码: ${failure.exitCode}\n\`\`\`\n${output}\n\`\`\``;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error ? String(error) : '';
}
