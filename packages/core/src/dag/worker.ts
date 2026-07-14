import type {AgentTool} from '@code-agent-lite/tools';
import {DefaultCodeAgent} from '../code-agent.js';
import {SYSTEM_PROMPT, createWorkspaceSystemMessages} from '../prompt.js';
import {AgentSession} from '../session.js';
import type {AgentEvent, AgentSessionOptions} from '../session-types.js';
import {TaskOutput, type Blackboard, type TaskNode} from './dag-model.js';

const EXPLORE_TOOLS = new Set(['read_file', 'grep', 'list_files', 'web_search', 'git_diff']);
const MAX_WORKER_RETRIES = 1;

const WORKER_ROLE_PROMPT = `你正在作为 DAG Worker 执行单个子任务。
只完成当前节点目标，不要扩展到无关工作。
上游结论仅供参考，关键判断仍需用工具验证。`;

const WORKER_RETRY_PROMPT = `上次执行未能成功完成。请检查当前工作区已有结果后继续完成同一目标；完成后必须输出明确的文字结论。`;

class WorkerCodeAgent extends DefaultCodeAgent {
  constructor(
    options: AgentSessionOptions,
    session: AgentSession,
    private readonly readOnly: boolean
  ) {
    super(options, session);
  }

  protected findTool(name: string): AgentTool | undefined {
    if (name === 'set_workspace' || (this.readOnly && !EXPLORE_TOOLS.has(name))) {
      return undefined;
    }

    return super.findTool(name);
  }
}

function buildUpstreamContext(node: TaskNode, blackboard: Blackboard) {
  const lines = node.dependsOn.flatMap((id) => {
    const output = blackboard.nodeOutputs.get(id);
    return output ? [`节点 ${id}：${output.summary}`] : [];
  });
  return lines.length ? ['[upstream]', ...lines].join('\n') : '';
}

function createWorkerOnEvent(parentSession: AgentSession, node: TaskNode): AgentSessionOptions['onEvent'] {
  let previousTokenUsage = {prompt: 0, completion: 0, total: 0};

  return (event: AgentEvent) => {
    switch (event.type) {
      case 'status':
      case 'thinking_delta':
      case 'thinking_end':
      case 'tool_end':
        parentSession.events.emit(event);
        break;
      case 'token_usage': {
        const delta = {
          prompt: Math.max(0, event.usage.prompt - previousTokenUsage.prompt),
          completion: Math.max(0, event.usage.completion - previousTokenUsage.completion),
          total: Math.max(0, event.usage.total - previousTokenUsage.total),
          contextUsed: event.usage.contextUsed,
          contextLimit: event.usage.contextLimit
        };
        previousTokenUsage = event.usage;
        parentSession.events.recordTokenUsage(delta);
        break;
      }
      case 'thinking_start':
        parentSession.events.emit(event);
        parentSession.events.emit({type: 'thinking_delta', delta: `[${node.id}]\n`});
        break;
      case 'tool_start':
        parentSession.events.emit({
          type: 'tool_start',
          call: {...event.call, name: `${node.id}:${event.call.name}`}
        });
        break;
      default:
        break;
    }
  };
}

export class DagWorker {
  constructor(
    private readonly node: TaskNode,
    private readonly blackboard: Blackboard,
    private readonly parentSession: AgentSession,
    private readonly maxSteps: number
  ) {}

  async run(): Promise<TaskOutput> {
    const output = new TaskOutput();
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_WORKER_RETRIES; attempt += 1) {
      const session = this.createSession();
      const agent = new WorkerCodeAgent(
        session.options,
        session,
        this.node.kind === 'explore'
      );
      const retryInstruction = attempt > 0 ? `\n\n${WORKER_RETRY_PROMPT}` : '';
      session.conversation.appendUser(`[本节点目标]\n${this.node.goal}${retryInstruction}`);

      try {
        const result = await agent.run();
        if (!result.completed) {
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
      }

      this.parentSession.throwIfAborted();
    }

    this.blackboard.mergeNodeOutput(this.node.id, output);
    throw lastError;
  }

  private createSession(): AgentSession {
    const session = new AgentSession(
      this.parentSession.createChildOptions({
        maxSteps: this.maxSteps,
        onEvent: createWorkerOnEvent(this.parentSession, this.node)
      })
    );
    session.setTurnSignal(this.parentSession.turnSignal());

    session.conversation.messages.splice(0, session.conversation.messages.length);
    session.conversation.messages.push(
      ...createWorkspaceSystemMessages(
        session.cwd,
        `${SYSTEM_PROMPT}\n\n${WORKER_ROLE_PROMPT}`
      ),
      {role: 'system', content: `Worker 节点：${this.node.id}（${this.node.kind}）`}
    );

    for (const skillPrompt of this.parentSession.skills.loadedPromptNotes()) {
      session.conversation.messages.push({role: 'system', content: skillPrompt});
    }

    const upstream = buildUpstreamContext(this.node, this.blackboard);
    if (upstream) {
      session.conversation.messages.push({role: 'system', content: upstream});
    }

    return session;
  }
}
