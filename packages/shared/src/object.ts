export function pickStringField(input: unknown, field: string): string | undefined {
  if (!input || typeof input !== 'object' || !(field in input)) {
    return;
  }

  const value = (input as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

export function pickField(input: unknown, field: string): string | undefined {
  if (!input || typeof input !== 'object' || !(field in input)) {
    return;
  }

  const value = (input as Record<string, unknown>)[field];
  if (value === undefined || value === null) {
    return;
  }

  return String(value);
}
