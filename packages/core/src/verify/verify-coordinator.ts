import {z} from 'zod';
import {joinSections} from '@code-agent-lite/shared';
import {llmReplan} from '../planner.js';
import {VERIFY_GATE_PROMPT} from '../prompt.js';
import type {ReActAgent} from '../react-agent.js';
import type {AgentSession} from '../session.js';
import type {TurnReview} from '../session-types.js';
import {StructuredLlmCaller} from '../structured-llm-caller.js';
import {createTaskOutput, type TaskNode, type TaskOutput} from '../dag/types.js';
import {createEmptyTurnOperations} from '../types/operations.js';
import {discoverVerifyCommands} from './verify-discovery.js';
import {
  buildFinalFailureReport,
  fallbackVerifyGate,
  formatTurnContextForGate,
  formatVerifyFailure
} from './verify-report.js';
import {runAllVerify} from './verify-runner.js';
import {
  decideFixLoopAction,
  MAX_FIX_ROUNDS,
  MAX_REPLAN_ATTEMPTS,
  type VerifyResult
} from './types.js';

const verifyGateSchema = z.object({
  shouldVerify: z.boolean(),
  reason: z.string()
});

export class VerifyCoordinator {
  constructor(private readonly cwd: string) {}

  async discover(): Promise<string[]> {
    return discoverVerifyCommands(this.cwd);
  }

  async runAll(commands?: string[]): Promise<VerifyResult[]> {
    const resolved = commands ?? (await this.discover());

    if (resolved.length === 0) {
      return [];
    }

    return runAllVerify(this.cwd, resolved);
  }

  async runNodeVerify(node: TaskNode): Promise<TaskOutput> {
    const commands = await this.discover();

    if (commands.length === 0) {
      return createTaskOutput({
        summary: '未找到可运行的验证命令，已跳过自动验证。',
        operations: createEmptyTurnOperations(),
        facts: ['当前工作区没有 npm test / typecheck 等验证命令']
      });
    }

    const failures = await this.runAll(commands);

    if (failures.length === 0) {
      return createTaskOutput({
        summary: `验证通过：${commands.join('、')}`,
        operations: {writtenFiles: [], deletedFiles: [], executedCommands: commands},
        facts: ['DAG verify 节点验证通过']
      });
    }

    throw new Error(`验证节点 ${node.id} 失败\n\n${formatVerifyFailure(failures, 1)}`);
  }

  static async judgeGate(session: AgentSession): Promise<TurnReview> {
    const context = session.collectTurnContext();
    session.status('thinking', '验证门禁');

    const gate = await StructuredLlmCaller.call({
      messages: [
        {role: 'system', content: VERIFY_GATE_PROMPT},
        {role: 'user', content: formatTurnContextForGate(context)}
      ],
      schema: verifyGateSchema,
      llmOptions: session.llmOptions(),
      fallback: fallbackVerifyGate(context)
    });

    return {...context, gate};
  }

  async runFixLoop(agent: ReActAgent, session: AgentSession, review: TurnReview): Promise<void> {
    const commands = await this.discover();

    if (commands.length === 0) {
      session.say(
        'system',
        [
          '## 无法自动验证',
          '',
          `触发原因：${review.gate.reason}`,
          '',
          '当前工作区未找到可用的验证命令（如 npm test、npm run typecheck 或 tsconfig.json）。',
          '已跳过自动验证，请手动确认改动是否正确。'
        ].join('\n')
      );
      session.status('done', '完成（无可用验证命令）');
      return;
    }

    let fixRound = 0;
    let replans = 0;

    while (true) {
      session.throwIfAborted();
      session.status('thinking', '自动验证');
      const failures = await this.runAll(commands);

      if (failures.length === 0) {
        session.status('done', '验证通过');
        return;
      }

      const action = decideFixLoopAction({
        fixRound,
        replans,
        maxFixRounds: MAX_FIX_ROUNDS,
        maxReplans: MAX_REPLAN_ATTEMPTS
      });

      if (action === 'give-up') {
        const report = buildFinalFailureReport({
          failures,
          fixRounds: MAX_FIX_ROUNDS,
          replans,
          operations: session.refreshOperations(),
          gate: review.gate
        });
        session.status('error', '验证未通过，已达最大尝试次数');
        session.say('system', report);
        return;
      }

      if (action === 'replan') {
        replans += 1;
        fixRound = 0;
        await llmReplan(session);
        session.appendUser(
          `${formatVerifyFailure(failures, MAX_FIX_ROUNDS)}\n\n先前修复方向可能不对，已换思路，请重新尝试。`
        );
        continue;
      }

      session.appendUser(formatVerifyFailure(failures, fixRound + 1));
      await agent.run();
      fixRound += 1;
    }
  }
}
