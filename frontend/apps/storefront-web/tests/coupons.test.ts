import { describe, expect, it } from 'vitest';

import { isExpired } from '../lib/coupon';

/**
 * FI-392 review nhóm C P1-4: pill "Hết hạn" chỉ hiện khi endsAt parse được
 * VÀ đã qua — thiếu/invalid không bịa pill (direction §4 tint-new).
 * (isExpired chuyển từ coupons/page.tsx sang lib để test được — page.tsx
 * cấm named export lạ theo validate type của Next.)
 */
describe('coupons isExpired — pill "Hết hạn"', () => {
  it('quá khứ → true', () => {
    expect(isExpired('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('tương lai → false', () => {
    expect(isExpired(new Date(Date.now() + 86_400_000).toISOString())).toBe(false);
  });

  it('invalid date → false', () => {
    expect(isExpired('not-a-date')).toBe(false);
  });

  it('undefined → false', () => {
    expect(isExpired(undefined as unknown as string)).toBe(false);
  });
});
