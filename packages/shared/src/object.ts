export function pickField(input: unknown, field: string): string | undefined {
  if (!input || typeof input !== 'object' || !(field in input)) {
    return;
  }

  return String((input as Record<string, unknown>)[field]);
}
