import {useCallback, useEffect, useRef} from 'react';
import {getAgentProviderKind} from '@code-agent-lite/platform';
import {
  AgentSession,
  runAgentTurn,
  type AgentEvent
} from '@code-agent-lite/core';

type Options = {
  onEvent(event: AgentEvent): void;
};

export function useAgentSession({onEvent}: Options) {
  const abortRef = useRef<AbortController | null>(null);
  const sessionPromiseRef = useRef<Promise<AgentSession> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const ensureSession = useCallback(async (cwd: string) => {
    if (!sessionPromiseRef.current) {
      const opening = AgentSession.open({
        cwd,
        provider: getAgentProviderKind(),
        onEvent: (event: AgentEvent) => onEventRef.current(event)
      });
      sessionPromiseRef.current = opening;

      try {
        await opening;
      } catch (error) {
        if (sessionPromiseRef.current === opening) {
          sessionPromiseRef.current = null;
        }
        throw error;
      }
    }

    return sessionPromiseRef.current;
  }, []);

  const clearSession = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const session = sessionPromiseRef.current;
    sessionPromiseRef.current = null;
    await (await session)?.dispose();
  }, []);

  useEffect(() => () => {
    void clearSession();
  }, [clearSession]);

  const cancelTurn = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runTurn = useCallback(async (input: string, cwd: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const session = await ensureSession(cwd);
    session.setTurnSignal(controller.signal);
    return runAgentTurn(session, input, cwd);
  }, [ensureSession]);

  return {clearSession, cancelTurn, runTurn};
}
