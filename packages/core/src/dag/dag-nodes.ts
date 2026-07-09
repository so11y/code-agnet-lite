import type {AgentSession} from '../session.js';
import {VerifyCoordinator} from '../verify/verify-coordinator.js';
import type {Blackboard, TaskNode} from './types.js';
import {createTaskOutput, type TaskOutput} from './types.js';
import {extractAssistantText} from '../openai-message.js';
import {callPlainLlm} from '../llm.js';
import {formatUserRequest} from '../prompt.js';
import {createEmptyTurnOperations} from '../types/operations.js';

export async function runVerifyNode(node: TaskNode, cwd: string): Promise<TaskOutput> {
  return new VerifyCoordinator(cwd).runNodeVerify(node);
}

export async function runMergeNode(
  node: TaskNode,
  blackboard: Blackboard,
  session: AgentSession,
  userInput: string
): Promise<TaskOutput> {
  const summaries = [...blackboard.nodeOutputs.entries()]
    .filter(([id]) => id !== node.id)
    .map(([id, output]) => `### ${id}\n${output.summary}`)
    .join('\n\n');

  const merged = [
    formatUserRequest(userInput),
    '',
    '各 Worker 摘要：',
    summaries || '（无 Worker 输出）',
    '',
    '请生成用户可见的最终回答，简洁说明完成了什么、关键结论与后续建议。'
  ].join('\n');

  session.status('thinking', 'Merge Agent');

  const response = await callPlainLlm(
    [
      {role: 'system', content: '你是 Merge Agent，负责汇总多个 Worker 的结果，生成用户可见的最终回答。'},
      {role: 'user', content: merged}
    ],
    session.llmOptions()
  );

  const summary = extractAssistantText(response) || '任务已完成。';
  session.say('assistant', summary);

  return createTaskOutput({
    summary,
    operations: createEmptyTurnOperations(),
    facts: [...blackboard.facts]
  });
}
