import {useCallback, useEffect, useRef} from 'react';
import type {AgentEvent} from '@code-agent-lite/core';
import {AgentSessionController} from '../services/agent-session-controller.js';

type Options = {
  onEvent(event: AgentEvent): void;
};

export function useAgentSession({onEvent}: Options) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const controllerRef = useRef<AgentSessionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new AgentSessionController((event) => onEventRef.current(event));
  }
  const controller = controllerRef.current;

  const clearSession = useCallback(() => controller.clear(), [controller]);

  useEffect(() => () => {
    void clearSession();
  }, [clearSession]);

  const cancelTurn = useCallback(() => controller.cancel(), [controller]);
  const runTurn = useCallback(
    (input: string, cwd: string) => controller.run(input, cwd),
    [controller]
  );

  return {clearSession, cancelTurn, runTurn};
}
