import {useCallback, useEffect, useRef} from 'react';
import {getAgentProviderKind} from '@code-agent-lite/platform';
import {
  agentProviders,
  AgentSession,
  runAgentTurn,
  type AgentEvent
} from '@code-agent-lite/core';

type Options = {
  onEvent(event: AgentEvent): void;
};

export function useAgentSession({onEvent}: Options) {
  const sessionRef = useRef<AgentSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const ensureSession = useCallback((cwd: string) => {
    if (!sessionRef.current) {
      sessionRef.current = new AgentSession({
        cwd,
        provider: getAgentProviderKind(),
        onEvent: (event) => onEventRef.current(event)
      });
    }

    return sessionRef.current;
  }, []);

  const clearSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    const session = sessionRef.current;
    sessionRef.current = null;

    if (session) {
      void agentProviders.dispose(session);
    }
  }, []);

  useEffect(() => () => {
    clearSession();
  }, [clearSession]);

  const cancelTurn = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runTurn = useCallback((input: string, cwd: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const session = ensureSession(cwd);
    session.setTurnSignal(controller.signal);
    return runAgentTurn(session, input, cwd);
  }, [ensureSession]);

  return {clearSession, cancelTurn, runTurn};
}
