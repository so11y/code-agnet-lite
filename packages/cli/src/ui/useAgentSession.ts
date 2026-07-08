import {useCallback, useEffect, useRef} from 'react';
import {
  createAgentSession,
  disposeCursorAgent,
  runAgentTurn,
  type AgentEvent,
  type AgentSession
} from '@code-agent-lite/core';

type Options = {
  onEvent(event: AgentEvent): void;
};

export function useAgentSession({onEvent}: Options) {
  const sessionRef = useRef<AgentSession | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const ensureSession = useCallback((cwd: string) => {
    if (!sessionRef.current) {
      sessionRef.current = createAgentSession({
        cwd,
        onEvent: (event) => onEventRef.current(event)
      });
    }

    return sessionRef.current;
  }, []);

  const clearSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;

    if (session) {
      void disposeCursorAgent(session);
    }
  }, []);

  useEffect(() => () => {
    clearSession();
  }, [clearSession]);

  const runTurn = useCallback((input: string, cwd: string) => {
    const session = ensureSession(cwd);
    return runAgentTurn(session, input, cwd);
  }, [ensureSession]);

  return {clearSession, runTurn};
}
