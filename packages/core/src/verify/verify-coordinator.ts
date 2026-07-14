import {llmReplan} from '../planner.js';
import {VERIFY_GATE_PROMPT} from '../prompt.js';
import type {CodeAgent} from '../code-agent.js';
import type {AgentSession} from '../session.js';
import type {ReasoningMode, TurnVerification} from '../session-types.js';
import {executeReasoningMode} from '../turn/execute-mode.js';
import {callStructuredLlm} from '../structured-llm-caller.js';
import {TaskOutput, type TaskNode} from '../dag/dag-model.js';
import {createEmptyTurnOperations, verifyGateSchema} from '../types/operations.js';
import {discoverVerifyCommands} from './verify-discovery.js';
import {
  buildFinalFailureReport,
  fallbackVerifyGate,
  formatTurnRecordForGate,
  formatVerifyFailure
} from './verify-report.js';
import {runAllVerify} from './verify-runner.js';
import {
  decideFixLoopAction,
  MAX_FIX_ROUNDS,
  MAX_REPLAN_ATTEMPTS,
  type VerifyResult
} from './types.js';

export class VerifyCoordinator {
  constructor(
    private readonly cwd: string,
    private readonly signal?: AbortSignal
  ) {}

  async discover(): Promise<string[]> {
    return discoverVerifyCommands(this.cwd);
  }

  async runAll(commands?: string[]): Promise<VerifyResult[]> {
    const resolved = commands ?? (await this.discover());

    if (resolved.length === 0) {
      return [];
    }

    return runAllVerify(this.cwd, resolved, this.signal);
  }

  async runNodeVerify(node: TaskNode): Promise<TaskOutput> {
    const commands = await this.discover();

    if (commands.length === 0) {
      return new TaskOutput({
        summary: '未找到可运行的验证命令，已跳过自动验证。',
        operations: createEmptyTurnOperations(),
        facts: ['当前工作区没有 npm test / typecheck 等验证命令']
      });
    }

    const failures = await this.runAll(commands);

    if (failures.length === 0) {
      return new TaskOutput({
        summary: `验证通过：${commands.join('、')}`,
        operations: {writtenFiles: [], deletedFiles: [], executedCommands: commands},
        facts: ['DAG verify 节点验证通过']
      });
    }

    throw new Error(`验证节点 ${node.id} 失败\n\n${formatVerifyFailure(failures, 1)}`);
  }

  static async judgeGate(session: AgentSession): Promise<TurnVerification> {
    const record = session.ledger.collectTurnRecord(session.conversation.extractLastAssistantText());
    session.events.status('thinking', '验证门禁');

    const gate = await callStructuredLlm({
      messages: [
        {role: 'system', content: VERIFY_GATE_PROMPT},
        {role: 'user', content: formatTurnRecordForGate(record)}
      ],
      schema: verifyGateSchema,
      llmOptions: session.llmOptions(),
      fallback: fallbackVerifyGate(record)
    });

    return {...record, gate};
  }

  async runFixLoop(
    agent: CodeAgent,
    session: AgentSession,
    verification: TurnVerification,
    mode?: ReasoningMode
  ): Promise<void> {
    const commands = await this.discover();

    if (commands.length === 0) {
      session.events.say(
        'system',
        [
          '## 无法自动验证',
          '',
          `触发原因：${verification.gate.reason}`,
          '',
          '当前工作区未找到可用的验证命令（如 npm test、npm run typecheck 或 tsconfig.json）。',
          '已跳过自动验证，请手动确认改动是否正确。'
        ].join('\n')
      );
      session.events.status('done', '完成（无可用验证命令）');
      return;
    }

    let fixRound = 0;
    let replans = 0;

    while (true) {
      session.throwIfAborted();
      session.events.status('thinking', '自动验证');
      const failures = await this.runAll(commands);

      if (failures.length === 0) {
        session.events.status('done', '验证通过');
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
          operations: session.ledger.snapshotOperations(),
          gate: verification.gate
        });
        session.events.status('error', '验证未通过，已达最大尝试次数');
        session.events.say('system', report);
        return;
      }

      if (action === 'replan') {
        replans += 1;
        fixRound = 0;
        await llmReplan(session);
        session.conversation.appendUser(
          `${formatVerifyFailure(failures, MAX_FIX_ROUNDS)}\n\n先前修复方向可能不对，已换思路，请重新尝试。`
        );
        await this.runFixAttempt(session, agent, mode);
        fixRound += 1;
        continue;
      }

      session.conversation.appendUser(formatVerifyFailure(failures, fixRound + 1));
      await this.runFixAttempt(session, agent, mode);
      fixRound += 1;
    }
  }

  private async runFixAttempt(
    session: AgentSession,
    agent: CodeAgent,
    mode?: ReasoningMode
  ): Promise<void> {
    await executeReasoningMode(session, mode === 'tot' ? 'tot' : 'react', {agent});
  }
}
