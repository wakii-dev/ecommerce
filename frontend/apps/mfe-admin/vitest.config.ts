import { defineConfig } from 'vitest/config';

/**
 * Unit tests logic admin (guard / stub / payload mapping) — node env.
 * Render smoke React (Task 9) dùng docblock `@vitest-environment jsdom`
 * per-file (jsdom chỉ nạp khi cần).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
  }
});
