import { defineConfig } from 'vitest/config';

/**
 * Unit tests cho pure helpers (format / seo / locale-rewrite) — node env,
 * KHÔNG render React (render-smoke React là việc Task 15). Ngoại lệ: file
 * test khai báo docblock `@vitest-environment jsdom` được override per-file
 * (copybutton.test.ts — render CopyButton, FI-392 review nhóm C P1-4).
 * globals: true để @testing-library/react tự bật auto-cleanup +
 * IS_REACT_ACT_ENVIRONMENT (cùng pattern ui-kit).
 */
export default defineConfig({
  // JSX runtime automatic (Next build tự có; vitest transform cần khai báo
  // tường minh để render component .tsx không phụ thuộc `import React`).
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
