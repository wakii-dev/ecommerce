import { defineConfig } from 'vitest/config';

/**
 * jsdom cho interaction tests (overlay.test.tsx — portal/ESC/focus).
 * Test cũ (uiKit.test.tsx) dùng renderToStaticMarkup — chạy được cả trong
 * jsdom. globals: true để @testing-library/react tự bật auto-cleanup +
 * IS_REACT_ACT_ENVIRONMENT.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  }
});
