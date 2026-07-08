import type {AgentSession} from '../session.js';
import {extractAssistantText} from '../openai-message.js';
import {callPlainLlm} from '../llm.js';
import {
  discoverVerifyCommands,
  formatVerifyFailure,
  runAllVerify
} from '../verify.js';
import type {Blackboard, TaskNode} from './types.js';
import {createTaskOutput, type TaskOutput} from './types.js';

export async function runVerifyNode(node: TaskNode, cwd: string): Promise<TaskOutput> {
  const commands = await discoverVerifyCommands(cwd);

  if (commands.length === 0) {
    return createTaskOutput({
      summary: '未找到可运行的验证命令，已跳过自动验证。',
      operations: {writtenFiles: [], deletedFiles: [], executedCommands: []},
      facts: ['当前工作区没有 npm test / typecheck 等验证命令']
    });
  }

  const failures = await runAllVerify(cwd, commands);

  if (failures.length === 0) {
    return createTaskOutput({
      summary: `验证通过：${commands.join('、')}`,
      operations: {writtenFiles: [], deletedFiles: [], executedCommands: commands},
      facts: ['DAG verify 节点验证通过']
    });
  }

  throw new Error(`验证节点 ${node.id} 失败\n\n${formatVerifyFailure(failures, 1)}`);
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
    `用户请求：${userInput}`,
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
    operations: {writtenFiles: [], deletedFiles: [], executedCommands: []},
    facts: [...blackboard.facts]
  });
}
