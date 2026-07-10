import {normalizePath} from '@code-agent-lite/shared';
import {union} from 'lodash-es';

const PATH_TOKEN_RE =
  /[`'"]?((?:packages|src|\.agent|\.cursor)[\w./-]*\.(?:ts|tsx|js|jsx|md|mdc|json|py|go|rs)|(?:packages|src)[\w./-]+)[`'"]?/g;

export type RuleContextState = {
  visitedFiles: string[];
  writtenFiles: string[];
  deletedFiles: string[];
};

export function collectContextPaths(input: string, state: RuleContextState): string[] {
  const paths = new Set<string>();

  for (const filePath of union(state.visitedFiles, state.writtenFiles, state.deletedFiles)) {
    if (filePath) {
      paths.add(normalizePath(filePath));
    }
  }

  for (const match of input.matchAll(PATH_TOKEN_RE)) {
    paths.add(normalizePath(match[1]));
  }

  return [...paths];
}
