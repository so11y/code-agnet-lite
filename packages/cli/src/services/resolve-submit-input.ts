import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {parseSkillInput} from '@code-agent-lite/tools';
import {parseFileReference, parseNewSessionCommand} from '@code-agent-lite/platform';
import {formatError} from '@code-agent-lite/shared';

export type SubmitIntent =
  | {type: 'noop'}
  | {type: 'new_session'}
  | {
      type: 'error';
      message: string;
      userDisplay?: string;
      systemMessages?: string[];
    }
  | {
      type: 'agent_run';
      content: string;
      workspace: string;
      userDisplay: string;
      systemMessages?: string[];
    };

export async function resolveSubmitInput(
  input: string,
  currentWorkspace: string
): Promise<SubmitIntent> {
  const displayInput = input.trim();
  if (!displayInput) {
    return {type: 'noop'};
  }

  const isNewSession = parseNewSessionCommand(displayInput);
  const userDisplay = buildUserDisplay(displayInput, isNewSession);

  let content = input;
  const systemMessages: string[] = [];
  const fileReference = parseFileReference(displayInput);

  if (fileReference) {
    try {
      const filePath = path.resolve(currentWorkspace, fileReference);
      content = await readFile(filePath, 'utf8');
      systemMessages.push(`已从文件加载：${filePath}`);
    } catch (error) {
      return {
        type: 'error',
        message: formatError(error),
        userDisplay,
        systemMessages: [`读取失败：${formatError(error)}`]
      };
    }
  }

  if (isNewSession) {
    return {type: 'new_session'};
  }

  return {
    type: 'agent_run',
    content,
    workspace: currentWorkspace,
    userDisplay: userDisplay ?? displayInput,
    systemMessages: systemMessages.length > 0 ? systemMessages : undefined
  };
}

function buildUserDisplay(displayInput: string, isNewSession: boolean) {
  if (isNewSession) {
    return undefined;
  }

  const {skillName, cleanedInput} = parseSkillInput(displayInput);
  return skillName ? `[skill:${skillName}] ${cleanedInput}` : displayInput;
}
