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
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const ensureSession = useCallback(async (cwd: string) => {
    return AgentSession.openSingleton({
      cwd,
      provider: getAgentProviderKind(),
      onEvent: (event: AgentEvent) => onEventRef.current(event)
    });
  }, []);

  const clearSession = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    await AgentSession.closeSingleton();
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
