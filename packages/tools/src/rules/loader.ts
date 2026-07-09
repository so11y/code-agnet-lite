import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseSkillMarkdown} from '../skills/frontmatter.js';
import type {AgentRule} from './types.js';
import {RULES_DIR} from './types.js';

function rulesRoot(cwd: string): string {
  return path.join(cwd, RULES_DIR);
}

function parseGlobs(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toRule(fileName: string, filePath: string, meta: Record<string, string>, body: string): AgentRule {
  const id = fileName.replace(/\.(mdc|md)$/i, '');
  return {
    id,
    description: meta.description?.trim() ?? '',
    globs: parseGlobs(meta.globs),
    alwaysApply: meta.alwaysApply === 'true',
    body,
    path: filePath
  };
}

async function readRuleFile(filePath: string, fileName: string): Promise<AgentRule | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const {meta, body} = parseSkillMarkdown(raw);
    return toRule(fileName, filePath, meta, body);
  } catch {
    return null;
  }
}

export async function discoverRules(cwd: string): Promise<AgentRule[]> {
  const root = rulesRoot(cwd);
  let entries: string[];

  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const rules: AgentRule[] = [];

  for (const fileName of entries) {
    if (!/\.(mdc|md)$/i.test(fileName)) {
      continue;
    }

    const rule = await readRuleFile(path.join(root, fileName), fileName);
    if (rule) {
      rules.push(rule);
    }
  }

  return rules.sort((a, b) => a.id.localeCompare(b.id));
}
