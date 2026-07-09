const PATH_TOKEN_RE =
  /[`'"]?((?:packages|src|\.agent|\.cursor)[\w./-]*\.(?:ts|tsx|js|jsx|md|mdc|json|py|go|rs)|(?:packages|src)[\w./-]+)[`'"]?/g;

export type RuleContextState = {
  visitedFiles: string[];
  writtenFiles: string[];
  deletedFiles: string[];
};

export function normalizeContextPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function collectContextPaths(input: string, state: RuleContextState): string[] {
  const paths = new Set<string>();

  for (const filePath of [...state.visitedFiles, ...state.writtenFiles, ...state.deletedFiles]) {
    if (filePath) {
      paths.add(normalizeContextPath(filePath));
    }
  }

  for (const match of input.matchAll(PATH_TOKEN_RE)) {
    paths.add(normalizeContextPath(match[1]));
  }

  return [...paths];
}
