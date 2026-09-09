import { describe, expect, it } from 'vitest';

import * as chrome from '../index';

/**
 * Smoke test scaffold (FI-398 T1) — package import được như 1 module.
 * Export thật (header-slots, SiteHeader, …) đến ở các task sau; mỗi task
 * sẽ mở rộng barrel index.ts và thêm test riêng.
 */
describe('@ecommerce/chrome scaffold', () => {
  it('imports as a module', () => {
    expect(chrome).toBeTruthy();
  });
});
