import { describe, expect, it } from 'vitest';

import { readAffiliateRef } from './affiliateRef';

/**
 * Unit SF-12 (review P1-2): đọc cookie attribution aff_ref cho POST /orders.
 * jsdom env — document.cookie mặc định; truyền cookieSource để test thuần.
 */
describe('readAffiliateRef', () => {
  it('đọc aff_ref giữa các cookie khác', () => {
    expect(readAffiliateRef('cart_token=abc; aff_ref=CETQZ7JL; theme=dark')).toBe('CETQZ7JL');
  });

  it('aff_ref đầu chuỗi', () => {
    expect(readAffiliateRef('aff_ref=AB234567')).toBe('AB234567');
  });

  it('không có aff_ref → null', () => {
    expect(readAffiliateRef('cart_token=abc')).toBeNull();
    expect(readAffiliateRef('')).toBeNull();
  });

  it('document.cookie thật (jsdom) — set rồi đọc được', () => {
    document.cookie = 'aff_ref=TESTCODE1; path=/';
    expect(readAffiliateRef()).toBe('TESTCODE1');
    document.cookie = 'aff_ref=; path=/; max-age=0';
    expect(readAffiliateRef()).toBeNull();
  });
});
