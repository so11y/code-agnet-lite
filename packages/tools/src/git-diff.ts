import {z} from 'zod';
import {formatCommandOutput, throwIfAborted} from '@code-agent-lite/shared';
import {createTool} from './common.js';
import {runArgvCommand} from './shell.js';

export const gitDiffTool = createTool({
  name: 'git_diff',
  description: '查看 git diff，了解工作区或暂存区的代码变更。',
  schema: z.object({
    staged: z.boolean().optional().describe('查看已暂存变更（git diff --cached）。'),
    ref: z.string().optional().describe('对比基准，例如 HEAD、main 或 HEAD~1。'),
    path: z.string().optional().describe('限定文件或目录路径。'),
    contextLines: z.number().int().min(0).max(20).optional().describe('上下文行数，默认 3。')
  }),
  async execute(input, context) {
    throwIfAborted(context.signal);

    const args = ['diff'];

    if (input.staged) {
      args.push('--cached');
    }

    if (input.contextLines !== undefined) {
      args.push(`-U${input.contextLines}`);
    }

    if (input.ref) {
      args.push(input.ref);
    }

    if (input.path) {
      args.push('--', input.path);
    }

    const result = await runArgvCommand('git', args, {
      cwd: context.cwd,
      signal: context.signal,
      timeout: 30_000
    });

    if (result.exitCode === 0 && !result.stdout?.trim()) {
      return '无变更。';
    }

    return formatCommandOutput(result);
  }
});
