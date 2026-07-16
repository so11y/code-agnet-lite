import type {AgentSession} from '../session.js';
import {formatUserRequest} from '../prompt.js';
import {agentProviders} from '../provider/agent-providers.js';
import {AgentRunReason} from '../react-agent.js';
import {AgentStatus} from '../session-types.js';
import type {ToolRegistry} from '../tool-registry.js';
import {TaskOutput, type Blackboard} from './dag-model.js';
import {createChildEventBridge} from './child-events.js';

const NO_TOOLS: ToolRegistry = {tools: [], find: () => undefined};
const MERGE_PROMPT = '你是 Merge Agent，负责汇总多个 Worker 的结果，生成用户可见的最终回答。';

export async function runMergeNode(
  blackboard: Blackboard,
  session: AgentSession,
  userInput: string
): Promise<TaskOutput> {
  const summaries = [...blackboard.nodeOutputs.entries()]
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

  session.events.status(AgentStatus.Thinking, 'Merge Agent');

  const child = session.createChild({
    maxSteps: 3,
    onEvent: createChildEventBridge(session, 'merge'),
    systemPrompt: MERGE_PROMPT,
    tools: NO_TOOLS
  });
  child.beginTurn(merged);
  child.conversation.appendUser(merged, {emit: false});
  const agent = agentProviders.provide(child);
  let summary = '';

  try {
    const result = await agent.run();
    if (result.reason !== AgentRunReason.FinalAnswer) {
      throw new Error('Merge Agent 未生成最终回答');
    }
    summary = child.conversation.extractLastAssistantText();
  } finally {
    await agentProviders.dispose(child);
  }

  summary ||= '任务已完成。';

  session.conversation.addAssistant({role: 'assistant', content: summary});

  return new TaskOutput({
    summary,
    facts: [...blackboard.facts]
  });
}
