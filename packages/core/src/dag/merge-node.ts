import type {AgentSession} from '../session.js';
import {TaskOutput, type Blackboard} from './dag-model.js';
import {extractAssistantText} from '../openai-message.js';
import {openAiLlm} from '../provider/openai-provider.js';
import {formatUserRequest} from '../prompt.js';

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

  session.events.status('thinking', 'Merge Agent');

  const skillPrompts = session.skills.loadedPromptNotes();
  const response = await openAiLlm.plainChat(
    [
      {
        role: 'system',
        content: [
          '你是 Merge Agent，负责汇总多个 Worker 的结果，生成用户可见的最终回答。',
          ...skillPrompts
        ].join('\n\n')
      },
      {role: 'user', content: merged}
    ],
    session.llmOptions()
  );

  const summary = extractAssistantText(response) || '任务已完成。';
  session.conversation.addAssistant({role: 'assistant', content: summary});

  return new TaskOutput({
    summary,
    facts: [...blackboard.facts]
  });
}
