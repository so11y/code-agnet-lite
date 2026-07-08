import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {toolsByName} from '@code-agent-lite/tools';
import {callLlmStream} from '../llm.js';
import {ReActAgent} from '../react-agent.js';
import {SYSTEM_PROMPT} from '../prompt.js';
import {AgentSession, createAgentSession} from '../session.js';
import type {AgentEvent, AgentMessage, AgentSessionOptions} from '../session-types.js';
import type {AgentTool} from '@code-agent-lite/tools';
import type {Blackboard, TaskNode} from './types.js';
import {createTaskOutput, type TaskOutput} from './types.js';
import {ResourceManager} from './resource-manager.js';

const EXPLORE_TOOLS = new Set(['read_file', 'grep', 'list_files', 'web_search']);
const BLOCKED_EXPLORE_TOOLS = new Set(['write_file', 'delete_file', 'run_cmd', 'set_workspace']);

const WORKER_PROMPT = `${SYSTEM_PROMPT}

你正在作为 DAG Worker 执行单个子任务。
只完成当前节点目标，不要扩展到无关工作。
上游结论仅供参考，关键判断仍需用工具验证。`;

class WorkerCodeAgent extends ReActAgent {
  constructor(
    options: AgentSessionOptions,
    session: AgentSession,
    private readonly readOnly: boolean,
    private readonly resourceManager: ResourceManager,
    private readonly nodeId: string
  ) {
    super(options, session);
  }

  protected async streamLlm(
    messages: AgentMessage[],
    onDelta: (delta: string) => void
  ): Promise<ChatCompletionAssistantMessageParam> {
    return callLlmStream(messages, this.session.streamOptions(onDelta));
  }

  protected findTool(name: string): AgentTool | undefined {
    if (this.readOnly && BLOCKED_EXPLORE_TOOLS.has(name)) {
      return undefined;
    }

    if (this.readOnly && !EXPLORE_TOOLS.has(name)) {
      return undefined;
    }

    return toolsByName.get(name);
  }

  protected override async beforeToolExecute(name: string, input: unknown): Promise<boolean> {
    const filePath = pickPath(input);

    switch (name) {
      case 'write_file':
        return filePath ? this.resourceManager.recordDynamicWrite(this.nodeId, filePath) : true;
      case 'delete_file':
        return filePath ? this.resourceManager.recordDynamicDelete(this.nodeId, filePath) : true;
      case 'run_cmd':
        return this.resourceManager.tryAcquireCommand(this.nodeId);
      case 'set_workspace':
        return false;
      default:
        return true;
    }
  }
}

function pickPath(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || !('path' in input)) {
    return;
  }

  return String((input as {path: unknown}).path);
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
  const session = createAgentSession({
    cwd: parentOptions.cwd,
    maxSteps: workerMaxSteps,
    provider: parentOptions.provider,
    onEvent: createWorkerOnEvent(parentOptions, node)
  });

  session.messages.splice(0, session.messages.length);
  session.messages.push(
    {role: 'system', content: WORKER_PROMPT},
    {role: 'system', content: `当前工作区：${parentOptions.cwd}`},
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
  resourceManager: ResourceManager,
  workerMaxSteps: number
): Promise<TaskOutput> {
  const workerSession = createWorkerSession(node, blackboard, parentSession.options, workerMaxSteps);

  const readOnly = node.kind === 'explore';
  const agent = new WorkerCodeAgent(
    {...parentSession.options, maxSteps: workerMaxSteps},
    workerSession,
    readOnly,
    resourceManager,
    node.id
  );

  workerSession.appendUser(`[本节点目标]\n${node.goal}`);
  const result = await agent.run();

  if (!result.completed) {
    throw new Error(`Worker ${node.id} 未在 ${result.steps} 步内完成`);
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
