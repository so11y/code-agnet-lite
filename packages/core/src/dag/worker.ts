import {joinSections} from '@code-agent-lite/shared';
import {SYSTEM_PROMPT} from '../prompt.js';
import {agentProviders} from '../provider/agent-providers.js';
import {AgentRunReason} from '../react-agent.js';
import {AgentSession} from '../session.js';
import type {ToolRegistry} from '../tool-registry.js';
import {TaskOutput, type Blackboard, type TaskNode} from './dag-model.js';
import {createChildEventBridge} from './child-events.js';

const EXPLORE_TOOLS = new Set(['read_file', 'grep', 'list_files', 'web_search', 'git_diff']);
const MAX_WORKER_RETRIES = 1;

const WORKER_ROLE_PROMPT = `你正在作为 DAG Worker 执行单个子任务。
只完成当前节点目标，不要扩展到无关工作。
上游结论仅供参考，关键判断仍需用工具验证。`;

const WORKER_RETRY_PROMPT =
  '上次执行未能成功完成。请检查当前工作区已有结果后继续完成同一目标；完成后必须输出明确的文字结论。';

function workerTools(session: AgentSession, readOnly: boolean): ToolRegistry {
  const tools = session.toolRegistry.tools.filter(
    (tool) => tool.name !== 'set_workspace' && (!readOnly || EXPLORE_TOOLS.has(tool.name))
  );
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return {tools, find: (name) => byName.get(name)};
}

function buildUpstreamContext(node: TaskNode, blackboard: Blackboard) {
  const lines = node.dependsOn.flatMap((id) => {
    const output = blackboard.nodeOutputs.get(id);
    return output ? [`节点 ${id}：${output.summary}`] : [];
  });
  return lines.length ? ['[upstream]', ...lines].join('\n') : '';
}

export class DagWorker {
  constructor(
    private readonly node: TaskNode,
    private readonly blackboard: Blackboard,
    private readonly parentSession: AgentSession,
    private readonly maxSteps: number,
    private readonly parentTurnContext: string
  ) {}

  async run(): Promise<TaskOutput> {
    const output = new TaskOutput();
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_WORKER_RETRIES; attempt += 1) {
      const session = this.createSession();
      const agent = agentProviders.provide(session);
      const retryInstruction = attempt > 0 ? `\n\n${WORKER_RETRY_PROMPT}` : '';
      const workerInput = joinSections(
        `[Worker 节点]\n${this.node.id}（${this.node.kind}）`,
        `[本节点目标]\n${this.node.goal}${retryInstruction}`,
        `[父任务上下文]\n${this.parentTurnContext}`,
        buildUpstreamContext(this.node, this.blackboard)
      );
      session.beginTurn(workerInput);
      session.conversation.appendUser(workerInput, {emit: false});

      try {
        const result = await agent.run();
        if (result.reason !== AgentRunReason.FinalAnswer) {
          throw new Error(`Worker ${this.node.id} 未在 ${result.steps} 步内完成`);
        }

        const summary = session.conversation.extractLastAssistantText();
        if (!summary.trim()) {
          throw new Error(`Worker ${this.node.id} 未返回有效摘要`);
        }

        output.summary = summary;
        return output;
      } catch (error) {
        lastError = error;
      } finally {
        output.mergeFrom(session.ledger.snapshot());
        await agentProviders.dispose(session);
      }

      this.parentSession.throwIfAborted();
    }

    this.blackboard.mergeNodeOutput(this.node.id, output);
    throw lastError;
  }

  private createSession(): AgentSession {
    return this.parentSession.createChild({
      maxSteps: this.maxSteps,
      onEvent: createChildEventBridge(this.parentSession, this.node.id),
      systemPrompt: `${SYSTEM_PROMPT}\n\n${WORKER_ROLE_PROMPT}`,
      tools: workerTools(this.parentSession, this.node.kind === 'explore')
    });
  }
}
