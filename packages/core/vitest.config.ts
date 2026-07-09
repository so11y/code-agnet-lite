import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__test__/**/*.test.ts'],
    // 普通单测保留默认 5s；debug 目录 / CLI --testTimeout=0 可关闭
    testTimeout: 5_000,
    hookTimeout: 10_000
  }
});
