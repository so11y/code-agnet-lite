export function formatList(title: string, items: string[]): string {
  if (!items.length) {
    return '';
  }

  return `${title}\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error ? String(error) : '';
}
