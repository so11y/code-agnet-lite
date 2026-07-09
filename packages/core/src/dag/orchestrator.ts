import type {AgentSession} from '../session.js';
import {formatError, joinSections} from '@code-agent-lite/shared';
import {runDag} from './dag-scheduler.js';
import {llmPlanDag} from './dag-planner.js';
import {Blackboard} from './types.js';

export async function runDagTurn(session: AgentSession, input: string): Promise<boolean> {
  session.reasoningMode = 'dag';

  try {
    const graph = await llmPlanDag(input, session);
    const blackboard = Blackboard.create();

    await runDag(graph, {
      session,
      blackboard,
      userInput: input
    });

    const mergeNode = [...graph.nodes.values()].find((node) => node.kind === 'merge');
    const failed = [...graph.nodes.values()].filter((node) => node.status === 'failed');
    const skipped = [...graph.nodes.values()].filter((node) => node.status === 'skipped');

    if (mergeNode?.status === 'done' && mergeNode.output?.summary) {
      session.mergeTurnOperations({
        writtenFiles: [...blackboard.writtenFiles],
        deletedFiles: [...blackboard.deletedFiles],
        executedCommands: [...blackboard.executedCommands]
      });
      return true;
    }

    if (failed.length > 0 || skipped.length > 0) {
      session.events.status('error', 'DAG 未完整完成');
      session.events.say(
        'system',
        joinSections(
          failed.length > 0
            ? `失败节点：${failed.map((node) => `${node.id}（${node.error ?? '未知'}）`).join('；')}`
            : '',
          skipped.length > 0 ? `跳过节点：${skipped.map((node) => node.id).join('、')}` : ''
        )
      );
      return false;
    }

    session.events.status('error', 'DAG 未完成 merge 节点');
    return false;
  } catch (error) {
    const message = formatError(error);
    session.events.status('error', message);
    session.events.say('assistant', message);
    throw error;
  }
}
