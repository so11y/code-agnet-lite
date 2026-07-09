import matter from 'gray-matter';

function metaValueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }

  return String(value);
}

function normalizeMeta(data: Record<string, unknown>): Record<string, string> {
  const meta: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    meta[key] = metaValueToString(value);
  }

  return meta;
}

export function parseSkillMarkdown(raw: string): {meta: Record<string, string>; body: string} {
  const trimmed = raw.trim();
  const {data, content} = matter(trimmed);

  return {
    meta: normalizeMeta(data),
    body: content.trim()
  };
}
