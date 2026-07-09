import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {pickField} from '@code-agent-lite/shared';
import type {AgentTool} from '@code-agent-lite/tools';
import {DefaultCodeAgent} from '../code-agent.js';
import {SYSTEM_PROMPT, createWorkspaceSystemMessages} from '../prompt.js';
import {AgentSession} from '../session.js';
import type {AgentEvent, AgentSessionOptions} from '../session-types.js';
import type {Blackboard, TaskNode} from './types.js';
import {createTaskOutput, type TaskOutput} from './types.js';
import type {ReleaseHandle, ResourceContext} from './resource-context.js';

const EXPLORE_TOOLS = new Set(['read_file', 'grep', 'list_files', 'web_search', 'git_diff']);
const BLOCKED_EXPLORE_TOOLS = new Set(['write_file', 'delete_file', 'run_cmd', 'set_workspace']);

const WORKER_ROLE_PROMPT = `你正在作为 DAG Worker 执行单个子任务。
只完成当前节点目标，不要扩展到无关工作。
上游结论仅供参考，关键判断仍需用工具验证。`;

class WorkerCodeAgent extends DefaultCodeAgent {
  readonly dynamicReleases: ReleaseHandle[] = [];

  constructor(
    options: AgentSessionOptions,
    session: AgentSession,
    private readonly readOnly: boolean,
    private readonly resourceCtx: ResourceContext,
    private readonly nodeId: string
  ) {
    super(options, session);
  }

  protected findTool(name: string): AgentTool | undefined {
    if (this.readOnly && BLOCKED_EXPLORE_TOOLS.has(name)) {
      return undefined;
    }

    if (this.readOnly && !EXPLORE_TOOLS.has(name)) {
      return undefined;
    }

    return super.findTool(name);
  }

  protected override async beforeToolExecute(name: string, input: unknown): Promise<boolean> {
    const filePath = pickField(input, 'path');

    switch (name) {
      case 'write_file':
        if (filePath) {
          this.dynamicReleases.push(await this.resourceCtx.acquireWrite(filePath, this.nodeId));
        }
        return true;
      case 'delete_file':
        if (filePath) {
          this.dynamicReleases.push(await this.resourceCtx.acquireWrite(filePath, this.nodeId));
        }
        return true;
      case 'run_cmd':
        this.dynamicReleases.push(await this.resourceCtx.acquireCommand(this.nodeId));
        return true;
      case 'set_workspace':
        return false;
      default:
        return true;
    }
  }
}

function buildUpstreamContext(node: TaskNode, blackboard: Blackboard) {
  const lines = node.dependsOn
    .map((id) => {
      const output = blackboard.nodeOutputs.get(id);
      if (!output) {
        return;
      }

      return `节点 ${id}：${output.summary}`;
    })
    .filter(Boolean);

  if (!lines.length) {
    return '';
  }

  return ['[upstream]', ...lines].join('\n');
}

function createWorkerOnEvent(parent: AgentSessionOptions, node: TaskNode): AgentSessionOptions['onEvent'] {
  return (event: AgentEvent) => {
    switch (event.type) {
      case 'tool_start':
        parent.onEvent({
          type: 'tool_start',
          call: {...event.call, name: `${node.id}:${event.call.name}`}
        });
        break;
      case 'tool_end':
        parent.onEvent({
          ...event,
          id: event.id
        });
        break;
      case 'token_usage':
        parent.onEvent(event);
        break;
      default:
        break;
    }
  };
}

export function createWorkerSession(
  node: TaskNode,
  blackboard: Blackboard,
  parentOptions: AgentSessionOptions,
  workerMaxSteps: number
): AgentSession {
  const session = AgentSession.create({
    cwd: parentOptions.cwd,
    maxSteps: workerMaxSteps,
    provider: parentOptions.provider,
    onEvent: createWorkerOnEvent(parentOptions, node)
  });

  session.messages.splice(0, session.messages.length);
  session.messages.push(
    ...createWorkspaceSystemMessages(parentOptions.cwd, `${SYSTEM_PROMPT}\n\n${WORKER_ROLE_PROMPT}`),
    {role: 'system', content: `Worker 节点：${node.id}（${node.kind}）`}
  );

  const upstream = buildUpstreamContext(node, blackboard);
  if (upstream) {
    session.messages.push({role: 'system', content: upstream});
  }

  return session;
}

export async function runWorkerNode(
  node: TaskNode,
  blackboard: Blackboard,
  parentSession: AgentSession,
  resourceCtx: ResourceContext,
  workerMaxSteps: number
): Promise<TaskOutput> {
  const workerSession = createWorkerSession(node, blackboard, parentSession.options, workerMaxSteps);

  const readOnly = node.kind === 'explore';
  const agent = new WorkerCodeAgent(
    {...parentSession.options, maxSteps: workerMaxSteps},
    workerSession,
    readOnly,
    resourceCtx,
    node.id
  );

  workerSession.appendUser(`[本节点目标]\n${node.goal}`);
  try {
    const result = await agent.run();

    if (!result.completed) {
      throw new Error(`Worker ${node.id} 未在 ${result.steps} 步内完成`);
    }
  } finally {
    agent.dynamicReleases.forEach((release) => release());
  }

  const summary = workerSession.extractLastAssistantText();
  if (!summary.trim()) {
    throw new Error(`Worker ${node.id} 未返回有效摘要`);
  }

  return createTaskOutput({
    summary,
    operations: workerSession.refreshOperations(),
    facts: [...workerSession.state.facts],
    visitedFiles: [...workerSession.state.visitedFiles],
    searchedTerms: [...workerSession.state.searchedTerms]
  });
}
