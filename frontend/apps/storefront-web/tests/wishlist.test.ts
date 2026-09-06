import { describe, expect, it } from 'vitest';

import { applyToggle } from '../components/wishlist/wishlist-api';

/**
 * Heart toggle reducer (SF-8 Task 12) — pure fn: add khi chưa có, remove khi
 * có, idempotent (add 2 lần / remove 2 lần không nhân bản không lỗi).
 */

describe('applyToggle', () => {
  it('add khi chưa có → thêm cuối', () => {
    expect(applyToggle(['a'], 'b', true)).toEqual(['a', 'b']);
  });

  it('add khi đã có → nguyên bản (idempotent)', () => {
    expect(applyToggle(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
  });

  it('remove khi có → bỏ đúng 1 phần tử', () => {
    expect(applyToggle(['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
  });

  it('remove khi không có → nguyên bản (DELETE luôn 204 ở API)', () => {
    expect(applyToggle(['a'], 'z', false)).toEqual(['a']);
  });
});
