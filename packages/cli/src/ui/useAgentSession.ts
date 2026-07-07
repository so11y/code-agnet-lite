import {useCallback, useRef} from 'react';
import {createAgentSession, runAgentTurn, type AgentEvent, type AgentSession} from '@code-agent-lite/core';

type Options = {
  onEvent(event: AgentEvent): void;
};

export function useAgentSession({onEvent}: Options) {
  const sessionRef = useRef<AgentSession | null>(null);

  const ensureSession = useCallback(
    (cwd: string) => {
      if (!sessionRef.current) {
        sessionRef.current = createAgentSession({cwd, onEvent});
      }
      return sessionRef.current;
    },
    [onEvent]
  );

  const clearSession = useCallback(() => {
    sessionRef.current = null;
  }, []);

  const runTurn = useCallback(
    (input: string, cwd: string) => {
      const session = ensureSession(cwd);
      return runAgentTurn(session, input, cwd);
    },
    [ensureSession]
  );

  return {clearSession, runTurn};
}
