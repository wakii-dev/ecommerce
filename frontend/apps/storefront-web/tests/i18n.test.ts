import { describe, expect, it } from 'vitest';

import { COPY, HERO_SLIDES, dictionaries, t, tParams } from '../lib/i18n';

/**
 * FI-392 T12 — parity vi/en cho dictionaries: mọi key đủ 2 locale, không
 * rỗng/whitespace; spot-check vài key; COPY (AddToCart) + HERO_SLIDES cũng
 * thuộc source of truth này.
 */

type Leaves = Record<string, { vi: string; en: string }>;

function allLeaves(): Array<[string, Leaves]> {
  return Object.entries(dictionaries).map(([domain, leaves]) => [domain, leaves as unknown as Leaves]);
}

describe('i18n dictionaries — parity vi/en', () => {
  it('mọi entry đủ vi + en, string không rỗng, không whitespace-only', () => {
    for (const [domain, leaves] of allLeaves()) {
      for (const [leaf, entry] of Object.entries(leaves)) {
        expect(typeof entry.vi, `${domain}.${leaf}.vi là string`).toBe('string');
        expect(typeof entry.en, `${domain}.${leaf}.en là string`).toBe('string');
        expect(entry.vi.trim().length, `${domain}.${leaf}.vi không rỗng`).toBeGreaterThan(0);
        expect(entry.en.trim().length, `${domain}.${leaf}.en không rỗng`).toBeGreaterThan(0);
      }
    }
  });

  it('spot-check vài key (header/pdp/reviews)', () => {
    expect(t('vi', 'header.cart')).toBe('Giỏ hàng');
    expect(t('en', 'header.cart')).toBe('Cart');
    expect(t('vi', 'pdp.atcAdd')).toBe('THÊM VÀO GIỎ');
    expect(t('en', 'reviews.write')).toBe('Write a review');
    expect(t('vi', 'coupons.copy')).toBe('Sao chép');
  });

  it('tParams interpolate {n}', () => {
    expect(tParams('vi', 'plp.pageN', { n: 2 })).toBe('Trang 2');
    expect(tParams('en', 'plp.pageN', { n: 3 })).toBe('Page 3');
    expect(tParams('vi', 'plp.productsCount', { n: 12 })).toBe('12 sản phẩm');
    expect(tParams('en', 'plp.productsCount', { n: 12 })).toBe('12 products');
  });

  it('COPY (AddToCart) giữ shape cũ + honesty toastFail', () => {
    expect(COPY.vi.toastFail).toBe('Không thêm được vào giỏ — thử lại');
    expect(COPY.en.toastFail).toBe("Couldn't add to cart — please try again");
    expect(COPY.vi.qty).toBe('Số lượng');
    expect(COPY.en.qty).toBe('Quantity');
  });

  it('HERO_SLIDES đủ 2 locale, cùng số slide, mọi string không rỗng', () => {
    expect(HERO_SLIDES.vi.length).toBe(HERO_SLIDES.en.length);
    expect(HERO_SLIDES.vi.length).toBeGreaterThan(0);
    for (let i = 0; i < HERO_SLIDES.vi.length; i += 1) {
      for (const field of ['gradient', 'kicker', 'title', 'ribbon'] as const) {
        expect(HERO_SLIDES.vi[i]?.[field], `vi slide ${i}.${field}`).toBeTruthy();
        expect(HERO_SLIDES.en[i]?.[field], `en slide ${i}.${field}`).toBeTruthy();
      }
    }
  });
});
