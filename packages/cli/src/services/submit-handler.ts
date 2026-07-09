import path from 'node:path';
import {readFile} from 'node:fs/promises';
import type {AgentStatus, ChatItem} from '@code-agent-lite/core';
import {parseSkillInput} from '@code-agent-lite/tools';
import {
  absolutePathCandidates,
  firstDirectory,
  parseNewSessionCommand,
  parseWorkspaceCommand
} from '@code-agent-lite/platform';
import {formatError} from '@code-agent-lite/shared';

export type SubmitActions = {
  workspace: string;
  appendMessage(item: ChatItem): void;
  updateStatus(status: AgentStatus, message?: string): void;
  setWorkspace(cwd: string): void;
  resetSession(cwd: string): void;
  switchWorkspace(input: string, target: string): Promise<void>;
  runInWorkspace(input: string, cwd: string): void;
};

export async function handleSubmit(input: string, actions: SubmitActions): Promise<void> {
  const displayInput = input.trim();
  if (!displayInput) {
    return;
  }

  const isNewSession = parseNewSessionCommand(displayInput);
  const workspaceTarget = parseWorkspaceCommand(displayInput);
  if (!isNewSession && !workspaceTarget) {
    const {skillName, cleanedInput} = parseSkillInput(displayInput);
    const userDisplay = skillName ? `[skill:${skillName}] ${cleanedInput}` : displayInput;
    actions.appendMessage({role: 'user', content: userDisplay});
  }

  let resolvedInput = input;

  const fileRef = /^@(.+)$/.exec(displayInput);
  if (fileRef) {
    try {
      const filePath = path.resolve(actions.workspace, fileRef[1].trim());
      resolvedInput = await readFile(filePath, 'utf8');
      actions.appendMessage({role: 'system', content: `已从文件加载：${filePath}`});
    } catch (error) {
      const message = formatError(error);
      actions.updateStatus('error', message);
      actions.appendMessage({role: 'system', content: `读取失败：${message}`});
      return;
    }
  }

  if (isNewSession) {
    actions.resetSession(actions.workspace);
    return;
  }

  if (workspaceTarget) {
    await actions.switchWorkspace(resolvedInput, workspaceTarget);
    return;
  }

  const isMultiline = resolvedInput.includes('\n');
  const paths = isMultiline ? [] : absolutePathCandidates(resolvedInput);

  if (paths.length === 0) {
    actions.runInWorkspace(resolvedInput, actions.workspace);
    return;
  }

  actions.updateStatus('thinking', paths[0]);
  const resolved = await firstDirectory(paths);
  if (!resolved) {
    const message = `工作区路径不存在或不是目录：${paths[0]}`;
    actions.updateStatus('error', message);
    actions.appendMessage({role: 'system', content: message});
    return;
  }

  if (resolved !== actions.workspace) {
    actions.setWorkspace(resolved);
    actions.appendMessage({role: 'system', content: `工作区：${resolved}`});
  }

  actions.runInWorkspace(resolvedInput, resolved);
}
