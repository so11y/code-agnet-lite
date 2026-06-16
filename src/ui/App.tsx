import path from 'node:path';
import React, {useCallback, useState} from 'react';
import {Box, Text} from 'ink';
import {runAgent} from '../agent/loop.js';
import type {AgentEvent, AgentStatus, ChatItem} from '../agent/types.js';
import {
  absolutePathCandidates,
  firstDirectory,
  isDirectory,
  parseWorkspaceCommand
} from '../utils/workspace.js';
import {ChatPanel} from './ChatPanel.js';
import {InputBox} from './InputBox.js';
import {StatusBar} from './StatusBar.js';
import type {TranscriptItem} from './transcript.js';

type Props = {
  cwd: string;
};

export function App({cwd}: Props) {
  const [workspace, setWorkspace] = useState(() => path.resolve(cwd));
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>();

  const appendMessage = useCallback((item: ChatItem) => {
    setItems((current) => [...current, {type: 'message', item}]);
  }, []);

  const updateStatus = useCallback((next: AgentStatus, message?: string) => {
    setStatus(next);
    setStatusMessage(message);
  }, []);

  const onEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case 'status':
          updateStatus(event.status, event.message);
          break;
        case 'message':
          appendMessage({role: event.role, content: event.content});
          break;
        case 'workspace':
          setWorkspace(event.cwd);
          setStatusMessage(event.cwd);
          appendMessage({role: 'system', content: `Workspace: ${event.cwd}`});
          break;
        case 'tool_start':
          setItems((current) => [...current, {type: 'tool', item: event.call}]);
          break;
        case 'tool_end':
          setItems((current) =>
            current.map((item) =>
              item.type === 'tool' && item.item.id === event.id
                ? {type: 'tool', item: {...item.item, output: event.output, error: event.error}}
                : item
            )
          );
          break;
      }
    },
    [appendMessage, updateStatus]
  );

  const runInWorkspace = useCallback(
    (input: string, cwdForRun: string) => {
      updateStatus('thinking', cwdForRun);
      void runAgent({cwd: cwdForRun, input, onEvent}).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        updateStatus('error', message);
        appendMessage({role: 'assistant', content: message});
      });
    },
    [appendMessage, onEvent, updateStatus]
  );

  const switchWorkspace = useCallback(
    async (input: string, target: string) => {
      const resolved = path.resolve(workspace, target);
      updateStatus('thinking', resolved);
      appendMessage({role: 'user', content: input});

      try {
        if (!(await isDirectory(resolved))) {
          throw new Error(`Workspace is not a directory: ${resolved}`);
        }

        setWorkspace(resolved);
        updateStatus('idle', resolved);
        appendMessage({role: 'system', content: `Workspace: ${resolved}`});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateStatus('error', message);
        appendMessage({role: 'system', content: message});
      }
    },
    [appendMessage, updateStatus, workspace]
  );

  const submit = useCallback(
    (input: string) => {
      const nextWorkspace = parseWorkspaceCommand(input);
      if (nextWorkspace) {
        void switchWorkspace(input, nextWorkspace);
        return;
      }

      const paths = absolutePathCandidates(input);
      if (paths.length === 0) {
        runInWorkspace(input, workspace);
        return;
      }

      updateStatus('thinking', paths[0]);
      void firstDirectory(paths).then((resolved) => {
        if (!resolved) {
          const message = `Workspace path does not exist or is not a directory: ${paths[0]}`;
          updateStatus('error', message);
          appendMessage({role: 'user', content: input});
          appendMessage({role: 'system', content: message});
          return;
        }

        if (resolved !== workspace) {
          setWorkspace(resolved);
          appendMessage({role: 'system', content: `Workspace: ${resolved}`});
        }

        runInWorkspace(input, resolved);
      });
    },
    [appendMessage, runInWorkspace, switchWorkspace, updateStatus, workspace]
  );

  const busy = status === 'thinking' || status === 'running_tool';

  return (
    <Box flexDirection="column" height="100%">
      <Box paddingX={1}>
        <Text bold color="cyan">OpenCode Lite</Text>
        <Text color="gray">  {workspace}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        <ChatPanel items={items} />
      </Box>
      <Box flexDirection="column">
        <StatusBar status={status} message={statusMessage} />
        <InputBox disabled={busy} onSubmit={submit} />
      </Box>
    </Box>
  );
}
