import {partition} from 'lodash-es';

export type EnforceOrder = 'pre' | 'post';

export type WithEnforce = {
  enforce?: EnforceOrder;
};

/** pre → 默认 → post，与 Vite/Rollup plugin enforce 顺序一致 */
export function sortByEnforceOrder<T extends WithEnforce>(items: T[]): T[] {
  const [pre, rest] = partition(items, (item) => item.enforce === 'pre');
  const [post, normal] = partition(rest, (item) => item.enforce === 'post');
  return [...pre, ...normal, ...post];
}
