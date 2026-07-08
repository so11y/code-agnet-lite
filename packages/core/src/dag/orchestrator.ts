import type {AgentSession} from '../session.js';
import {runDag} from './dag-promise-scheduler.js';
import {llmPlanDag} from './dag-planner.js';
import {createBlackboard} from './types.js';

export async function runDagTurn(session: AgentSession, input: string): Promise<void> {
  session.reasoningMode = 'dag';

  try {
    const graph = await llmPlanDag(input, session);
    const blackboard = createBlackboard();

    await runDag(graph, {
      session,
      blackboard,
      userInput: input
    });

    const mergeNode = [...graph.nodes.values()].find((node) => node.kind === 'merge');
    const failed = [...graph.nodes.values()].filter((node) => node.status === 'failed');
    const skipped = [...graph.nodes.values()].filter((node) => node.status === 'skipped');

    if (mergeNode?.status === 'done' && mergeNode.output?.summary) {
      session.status('done', 'DAG 完成');
      return;
    }

    if (failed.length > 0 || skipped.length > 0) {
      session.status('error', 'DAG 未完整完成');
      session.say(
        'system',
        [
          failed.length > 0
            ? `失败节点：${failed.map((node) => `${node.id}（${node.error ?? '未知'}）`).join('；')}`
            : '',
          skipped.length > 0 ? `跳过节点：${skipped.map((node) => node.id).join('、')}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      );
      return;
    }

    session.status('error', 'DAG 未完成 merge 节点');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.status('error', message);
    session.say('assistant', message);
    throw error;
  }
}
