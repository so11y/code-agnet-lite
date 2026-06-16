import type {AgentTool} from '../agent/types.js';
import {grepTool} from './grep.js';
import {listFilesTool} from './list-files.js';
import {readFileTool} from './read-file.js';
import {runCmdTool} from './run-cmd.js';
import {setWorkspaceTool} from './set-workspace.js';
import {writeFileTool} from './write-file.js';

export const tools: AgentTool[] = [
  readFileTool,
  writeFileTool,
  grepTool,
  listFilesTool,
  runCmdTool,
  setWorkspaceTool
];

export const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
