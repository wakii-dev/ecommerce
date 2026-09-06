import { defineConfig } from 'vitest/config';

/**
 * Unit tests cho pure helpers (format / seo / locale-rewrite) — node env,
 * KHÔNG render React (render-smoke React là việc Task 15).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
