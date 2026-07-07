export function truncate(value: string, maxLength = 12_000): string {
  if (value.length <= maxLength) {
    return value;
  }

  const omitted = value.length - maxLength;
  return `${value.slice(0, maxLength)}\n\n[truncated ${omitted} chars]`;
}

export function compactText(value: unknown, maxLength = 160): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return truncate((text || '').replace(/\s+/g, ' '), maxLength);
}
