import { defineConfig } from 'vitest/config';

/**
 * jsdom cho component tests (SiteHeader/CartBadge/AuthMenu — spec §5).
 * globals: true để @testing-library/react tự bật auto-cleanup +
 * IS_REACT_ACT_ENVIRONMENT (pattern ui-kit).
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  }
});
