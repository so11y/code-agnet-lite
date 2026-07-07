import {execa} from 'execa';
import {z} from 'zod';
import {formatCommandOutput, truncate, type CommandResult} from '@code-agent-lite/shared';
import {createTool, RG_IGNORE_GLOBS} from './common.js';

export const grepTool = createTool({
  name: 'grep',
  description: '使用 ripgrep 在工作区中搜索文本。',
  schema: z.object({
    pattern: z.string().describe('ripgrep 搜索模式。'),
    glob: z.string().optional().describe('可选 glob 过滤，例如 src/**/*.ts。'),
    timeoutMs: z.number().optional().describe('可选超时时间（毫秒），默认 10000。')
  }),
  async execute(input, context) {
    const args = ['--line-number', '--color', 'never', '--no-messages', '--max-filesize', '2M'];

    for (const ignore of RG_IGNORE_GLOBS) {
      args.push('--glob', ignore);
    }

    if (input.glob) {
      args.push('--glob', input.glob);
    }

    args.push(input.pattern);

    try {
      const result = await execa('rg', args, {
        cwd: context.cwd,
        reject: false,
        timeout: input.timeoutMs ?? 10_000
      });

      if (result.exitCode === 1) {
        return '未找到匹配项。';
      }

      if (result.exitCode !== 0) {
        return formatCommandOutput(result, '搜索超时。');
      }

      return truncate(result.stdout);
    } catch (error) {
      return formatCommandOutput(error as CommandResult, '搜索超时。');
    }
  }
});
