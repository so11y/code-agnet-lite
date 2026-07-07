import type {AgentTool} from './types.js';
import {deleteFileTool} from './delete-file.js';
import {grepTool} from './grep.js';
import {listFilesTool} from './list-files.js';
import {readFileTool} from './read-file.js';
import {runCmdTool} from './run-cmd.js';
import {setWorkspaceTool} from './set-workspace.js';
import {webSearchTool} from './web-search.js';
import {writeFileTool} from './write-file.js';

export const tools: AgentTool[] = [
  readFileTool,
  writeFileTool,
  deleteFileTool,
  grepTool,
  webSearchTool,
  listFilesTool,
  runCmdTool,
  setWorkspaceTool
];

export const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
