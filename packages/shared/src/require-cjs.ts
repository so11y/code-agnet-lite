import {createRequire} from 'node:module';

/** Load a CJS package consistently from ESM (tsx, Vitest, Node). */
export function requireCjs<T = unknown>(
  specifier: string,
  parentUrl: string = import.meta.url
): T {
  return createRequire(parentUrl)(specifier) as T;
}
