import {execa} from 'execa';
import {z} from 'zod';
import {formatCommandOutput, type CommandResult} from '../utils/command-output.js';
import {truncate} from '../utils/truncate.js';
import {createTool} from './common.js';

const defaultIgnoreGlobs = [
  '!node_modules/**',
  '!dist/**',
  '!build/**',
  '!out/**',
  '!coverage/**',
  '!.git/**'
];

export const grepTool = createTool({
  name: 'grep',
  description: 'Search workspace text using ripgrep.',
  schema: z.object({
    pattern: z.string().describe('Ripgrep search pattern.'),
    glob: z.string().optional().describe('Optional glob filter, for example src/**/*.ts.'),
    timeoutMs: z.number().optional().describe('Optional timeout in milliseconds. Defaults to 10000.')
  }),
  async execute(input, context) {
    const args = ['--line-number', '--color', 'never', '--no-messages', '--max-filesize', '2M'];

    for (const ignore of defaultIgnoreGlobs) {
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
        return 'No matches.';
      }

      if (result.exitCode !== 0) {
        return formatCommandOutput(result, 'Timed out while searching.');
      }

      return truncate(result.stdout);
    } catch (error) {
      return formatCommandOutput(error as CommandResult, 'Timed out while searching.');
    }
  }
});
