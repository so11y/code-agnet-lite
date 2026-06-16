import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {execaCommand} from 'execa';
import {z} from 'zod';
import {formatCommandOutput, type CommandResult} from '../utils/command-output.js';
import {parseAssistantJson} from '../utils/openai-message.js';
import {formatList} from '../utils/text-format.js';
import {callPlainLlm} from './llm.js';
import {llmReplan} from './planner.js';
import {VERIFY_GATE_PROMPT} from './prompt.js';
import type {ReActAgent} from './react-agent.js';
import type {AgentSession} from './session.js';
import type {TurnContext, TurnReview, VerifyGate} from './session-types.js';

export type VerifyResult = {
  command: string;
  exitCode: number;
  output: string;
};

const verifyGateSchema = z.object({
  shouldVerify: z.boolean(),
  reason: z.string()
});

const MAX_FIX_ROUNDS = 3;
const MAX_REPLAN_ATTEMPTS = 1;

function formatTurnContextForGate(context: TurnContext): string {
  const writtenFiles = context.operations.writtenFiles.length
    ? formatList('write_file 写入的文件：', context.operations.writtenFiles)
    : 'write_file 写入的文件：（无）';
  const executedCommands = context.operations.executedCommands.length
    ? formatList('run_cmd 执行的命令：', context.operations.executedCommands)
    : 'run_cmd 执行的命令：（无）';

  return [
    `用户请求：\n${context.userInput}`,
    writtenFiles,
    executedCommands,
    `Agent 最终回答：\n${context.assistantText || '（无文本回答）'}`
  ].join('\n\n');
}

function fallbackVerifyGate(context: TurnContext): VerifyGate {
  if (context.operations.writtenFiles.length > 0) {
    return {
      shouldVerify: true,
      reason: `本轮写入了 ${context.operations.writtenFiles.length} 个文件（${context.operations.writtenFiles.join('、')}）`
    };
  }

  return {
    shouldVerify: false,
    reason: '未检测到文件写入，默认跳过自动验证'
  };
}

export async function judgeShouldVerify(session: AgentSession): Promise<TurnReview> {
  const context = session.collectTurnContext();
  session.status('thinking', '验证门禁');

  const response = await callPlainLlm(
    [
      {role: 'system', content: VERIFY_GATE_PROMPT},
      {role: 'user', content: formatTurnContextForGate(context)}
    ],
    session.llmOptions()
  );

  let gate: VerifyGate;

  try {
    gate = parseAssistantJson(response, verifyGateSchema);
  } catch {
    gate = fallbackVerifyGate(context);
  }

  return {...context, gate};
}

export async function discoverVerifyCommands(cwd: string): Promise<string[]> {
  const commands: string[] = [];
  const pkgPath = path.join(cwd, 'package.json');

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
        scripts?: Record<string, string>;
      };
      const test = pkg.scripts?.test;
      if (test && !/no test specified/i.test(test)) {
        commands.push('npm test');
      }
      if (pkg.scripts?.typecheck) {
        commands.push('npm run typecheck');
      }
    } catch {
      // ignore malformed package.json
    }
  }

  if (existsSync(path.join(cwd, 'tsconfig.json')) && !commands.some((command) => command.includes('typecheck'))) {
    commands.push('npx tsc --noEmit');
  }

  return commands.length > 0 ? commands : ['npx tsc --noEmit'];
}

export async function runVerifyCommand(cwd: string, command: string): Promise<VerifyResult> {
  const result = (await execaCommand(command, {
    cwd,
    shell: true,
    reject: false
  })) as CommandResult;

  return {
    command,
    exitCode: Number(result.exitCode ?? result.code ?? 1),
    output: formatCommandOutput(result)
  };
}

export async function runAllVerify(cwd: string, commands: string[]): Promise<VerifyResult[]> {
  const results = await Promise.all(commands.map((command) => runVerifyCommand(cwd, command)));
  return results.filter((result) => result.exitCode !== 0);
}

export function formatVerifyFailure(failures: VerifyResult[], round: number): string {
  const blocks = failures.map(
    (failure) =>
      `### 命令: \`${failure.command}\`\n退出码: ${failure.exitCode}\n\`\`\`\n${failure.output}\n\`\`\``
  );

  return [
    `自动验证失败（第 ${round} 轮修复）。请根据以下输出修复代码。`,
    '修复完成后不要声称任务已完成，系统会再次自动验证。',
    ...blocks
  ].join('\n\n');
}

function inferFailureReasons(failures: VerifyResult[]): string[] {
  const reasons: string[] = [];
  const combined = failures.map((failure) => failure.output).join('\n');

  if (/TS\d{4}/.test(combined)) {
    reasons.push('存在 TypeScript 类型错误，自动修复未能完全消除');
  }
  if (/FAIL|AssertionError|Expected|received/i.test(combined)) {
    reasons.push('单元测试断言失败，逻辑或边界条件仍有问题');
  }
  if (/MODULE_NOT_FOUND|Cannot find module/i.test(combined)) {
    reasons.push('缺少依赖或模块路径错误，可能需要先安装依赖');
  }
  if (/ENOENT|EACCES/i.test(combined)) {
    reasons.push('文件或权限问题，可能与工作区路径有关');
  }
  if (reasons.length === 0) {
    reasons.push('验证命令返回非零退出码，请查看上方具体错误输出');
  }

  return reasons;
}

export function buildFinalFailureReport(options: {
  failures: VerifyResult[];
  fixRounds: number;
  replans: number;
  writtenFiles: string[];
  gate: VerifyGate;
}): string {
  const {failures, fixRounds, replans, writtenFiles, gate} = options;

  const failureBlocks = failures.map(
    (failure) =>
      `- **${failure.command}** → 退出码 **${failure.exitCode}**\n\`\`\`\n${failure.output.slice(0, 2000)}\n\`\`\``
  );

  const reasons = inferFailureReasons(failures);

  return [
    '## 验证未通过，自动修复已停止',
    '',
    `触发原因：${gate.reason}`,
    '',
    `已尝试：**${fixRounds} 轮**自动修复${replans > 0 ? ` + **${replans} 次**换思路` : ''}，仍无法通过验证。`,
    '',
    '### 失败命令',
    ...failureBlocks,
    '',
    '### 可能原因',
    ...reasons.map((reason) => `- ${reason}`),
    '',
    writtenFiles.length > 0
      ? `### 本轮已修改文件\n${writtenFiles.map((file) => `- ${file}`).join('\n')}`
      : '### 本轮已修改文件\n（未检测到 write_file 调用）',
    '',
    '### 建议下一步',
    '- 根据上方错误手动修复后，重新发起请求',
    '- 或在终端手动运行失败命令查看完整输出'
  ].join('\n');
}

export async function runVerifyAndFixLoop(
  agent: ReActAgent,
  session: AgentSession,
  review: TurnReview
): Promise<void> {
  const commands = await discoverVerifyCommands(session.cwd);
  let replans = 0;

  for (let fixRound = 0; ; fixRound += 1) {
    session.status('thinking', '自动验证');
    const failures = await runAllVerify(session.cwd, commands);

    if (failures.length === 0) {
      session.status('done', '验证通过');
      return;
    }

    if (fixRound >= MAX_FIX_ROUNDS) {
      if (replans < MAX_REPLAN_ATTEMPTS) {
        replans += 1;
        fixRound = -1;
        await llmReplan(session);
        session.appendUser(
          `${formatVerifyFailure(failures, MAX_FIX_ROUNDS)}\n\n先前修复方向可能不对，已换思路，请重新尝试。`
        );
        continue;
      }

      const report = buildFinalFailureReport({
        failures,
        fixRounds: MAX_FIX_ROUNDS,
        replans,
        writtenFiles: session.refreshOperations().writtenFiles,
        gate: review.gate
      });
      session.status('error', '验证未通过，已达最大尝试次数');
      session.say('system', report);
      return;
    }

    session.appendUser(formatVerifyFailure(failures, fixRound + 1));
    await agent.run({suppressTerminalStatus: true});
  }
}
