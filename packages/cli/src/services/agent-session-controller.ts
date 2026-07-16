import {getAgentProviderKind} from '@code-agent-lite/platform';
import {
  AgentSession,
  runAgentTurn,
  type AgentEvent,
  type TurnExecution
} from '@code-agent-lite/core';

export class AgentSessionController {
  private abortController?: AbortController;
  private session?: Promise<AgentSession>;
  private turn?: Promise<TurnExecution | undefined>;

  constructor(private readonly onEvent: (event: AgentEvent) => void) {}

  cancel(): void {
    this.abortController?.abort();
  }

  async clear(): Promise<void> {
    this.cancel();
    this.abortController = undefined;

    const activeTurn = this.turn;
    const session = this.session;
    this.session = undefined;

    await activeTurn?.catch(() => undefined);
    if (this.turn === activeTurn) {
      this.turn = undefined;
    }

    await (await session)?.dispose();
  }

  run(input: string, cwd: string): Promise<TurnExecution | undefined> {
    this.cancel();
    const controller = new AbortController();
    const previousTurn = this.turn;
    this.abortController = controller;

    const turn = (async () => {
      await previousTurn?.catch(() => undefined);
      if (controller.signal.aborted) {
        return undefined;
      }

      const session = await this.ensureSession(cwd);
      session.setTurnSignal(controller.signal);
      return runAgentTurn(session, input, cwd);
    })();

    this.turn = turn;
    const clearCompletedTurn = () => {
      if (this.turn === turn) {
        this.turn = undefined;
      }
    };
    void turn.then(clearCompletedTurn, clearCompletedTurn);
    return turn;
  }

  private async ensureSession(cwd: string): Promise<AgentSession> {
    if (!this.session) {
      const opening = AgentSession.open({
        cwd,
        provider: getAgentProviderKind(),
        onEvent: this.onEvent
      });
      this.session = opening;

      try {
        await opening;
      } catch (error) {
        if (this.session === opening) {
          this.session = undefined;
        }
        throw error;
      }
    }

    return this.session;
  }
}
