const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseYamlLines(block: string): Record<string, string> {
  const meta: Record<string, string> = {};

  for (const line of block.split('\n')) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }

    meta[match[1]] = match[2].trim();
  }

  return meta;
}

export function parseSkillMarkdown(raw: string): {meta: Record<string, string>; body: string} {
  const trimmed = raw.trim();
  const match = FRONTMATTER_RE.exec(trimmed);

  if (!match) {
    return {meta: {}, body: trimmed};
  }

  return {
    meta: parseYamlLines(match[1]),
    body: match[2].trim()
  };
}
