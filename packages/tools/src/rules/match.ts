import type {AgentRule} from './types.js';
import {collectContextPaths, type RuleContextState} from './context-paths.js';

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\?/g, '[^/]');

  return new RegExp(`^${escaped}$`);
}

function matchesGlob(pattern: string, filePath: string): boolean {
  return globToRegExp(pattern).test(filePath);
}

export function ruleMatchesContext(rule: AgentRule, input: string, state: RuleContextState): boolean {
  if (rule.alwaysApply) {
    return true;
  }

  if (!rule.globs.length) {
    return false;
  }

  const paths = collectContextPaths(input, state);
  if (!paths.length) {
    return false;
  }

  return paths.some((filePath) => rule.globs.some((pattern) => matchesGlob(pattern, filePath)));
}

export function selectMatchingRules(rules: AgentRule[], input: string, state: RuleContextState): AgentRule[] {
  return rules.filter((rule) => ruleMatchesContext(rule, input, state));
}
