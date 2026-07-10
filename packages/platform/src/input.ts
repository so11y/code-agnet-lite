export function parseFileReference(input: string) {
  return /^@(.+)$/.exec(input.trim())?.[1]?.trim();
}
