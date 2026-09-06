import { describe, expect, it } from 'vitest';

import { couponValueLabel } from '../lib/coupon';
import { buildPlpUrl } from '../lib/plp-params';
import { buildProductSitemapEntries, buildStaticSitemapEntries } from '../lib/seo';
import { moveActive, parseSearchPageParams, SEARCH_SUGGESTED_KEYWORDS, suggestUrl } from '../lib/search';

const BASE = 'http://localhost:3000';

describe('parseSearchPageParams', () => {
  it('q hợp lệ → giữ nguyên (trim khoảng trắng), page/sort parse như PLP', () => {
    expect(parseSearchPageParams({ q: ' xiaomi ', page: '3', sort: 'price_asc' })).toEqual({
      q: 'xiaomi',
      page: 3,
      sort: 'price_asc',
    });
  });

  it('q thiếu/rỗng → chuỗi rỗng (page render empty-state nhập từ khóa)', () => {
    expect(parseSearchPageParams({}).q).toBe('');
    expect(parseSearchPageParams({ q: '   ' }).q).toBe('');
    expect(parseSearchPageParams({ q: ['a', 'b'] }).q).toBe('a');
  });

  it('page/sort garbage → mặc định 1 / newest (garbage-tolerant như PLP)', () => {
    const query = parseSearchPageParams({ q: 'ao', page: '0', sort: 'DROP TABLE' });
    expect(query.page).toBe(1);
    expect(query.sort).toBe('newest');
  });
});

describe('suggestUrl', () => {
  it('relative path qua rewrites proxy + encode q + locale', () => {
    expect(suggestUrl('điện thoại', 'vi')).toBe('/api/catalog/search/suggest?q=%C4%91i%E1%BB%87n%20tho%E1%BA%A1i&locale=vi');
    expect(suggestUrl('shirt', 'en')).toBe('/api/catalog/search/suggest?q=shirt&locale=en');
  });
});

describe('moveActive (keyboard nav dropdown suggest)', () => {
  it('chưa chọn (-1): ArrowDown → 0, ArrowUp → phần tử cuối', () => {
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(-1, -1, 3)).toBe(2);
  });

  it('wrap vòng: cuối + 1 → đầu, đầu - 1 → cuối', () => {
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
  });

  it('danh sách rỗng → luôn -1 (không crash)', () => {
    expect(moveActive(-1, 1, 0)).toBe(-1);
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});

describe('buildProductSitemapEntries', () => {
  it('vi url /p/{slug} + en /en/p/{slugEn} trong alternates.languages', () => {
    const entries = buildProductSitemapEntries([{ slug: 'dien-thoai-x', slugEn: 'phone-x' }], BASE);
    expect(entries).toEqual([
      {
        url: 'http://localhost:3000/p/dien-thoai-x',
        changeFrequency: 'weekly',
        alternates: {
          languages: {
            vi: 'http://localhost:3000/p/dien-thoai-x',
            en: 'http://localhost:3000/en/p/phone-x',
          },
        },
      },
    ]);
  });

  it('nhiều card → 1 entry/card, thứ tự giữ nguyên', () => {
    const entries = buildProductSitemapEntries(
      [
        { slug: 'a', slugEn: 'a-en' },
        { slug: 'b', slugEn: 'b-en' },
      ],
      BASE,
    );
    expect(entries.map((entry) => entry.url)).toEqual([`${BASE}/p/a`, `${BASE}/p/b`]);
  });
});

describe('buildStaticSitemapEntries', () => {
  it('đủ 6 url (3 route × vi/en), mỗi url mang đủ alternates cặp vi/en', () => {
    const entries = buildStaticSitemapEntries(BASE);
    expect(entries.map((entry) => entry.url)).toEqual([
      `${BASE}/`,
      `${BASE}/en/`,
      `${BASE}/search`,
      `${BASE}/en/search`,
      `${BASE}/coupons`,
      `${BASE}/en/coupons`,
    ]);
    expect(entries[2]?.alternates.languages).toEqual({ vi: `${BASE}/search`, en: `${BASE}/en/search` });
  });
});

describe('couponValueLabel', () => {
  it('PERCENT → phần trăm; FIXED → số VND format', () => {
    expect(couponValueLabel('PERCENT', 10, 'vi')).toBe('Giảm 10%');
    expect(couponValueLabel('PERCENT', 10, 'en')).toBe('10% off');
    expect(couponValueLabel('FIXED', 50000, 'vi')).toBe('Giảm 50.000 ₫');
    expect(couponValueLabel('FIXED', 50000, 'en')).toBe('50.000 ₫ off');
  });
});

describe('buildPlpUrl extra params (Pagination trên /search giữ q)', () => {
  it('extra q được serialize + page đổi giữ nguyên q', () => {
    expect(buildPlpUrl('/search', { sort: 'newest', page: 2, filters: {} }, { q: 'xiaomi' })).toBe(
      '/search?q=xiaomi&page=2',
    );
    expect(buildPlpUrl('/search', { sort: 'price_asc', page: 1, filters: {} }, { q: 'xiaomi' })).toBe(
      '/search?q=xiaomi&sort=price_asc',
    );
  });

  it('không extra → hành vi cũ (backward-compat)', () => {
    expect(buildPlpUrl('/c/dien-tu', { sort: 'newest', page: 1, filters: {} })).toBe('/c/dien-tu');
  });

  it('extra q rỗng/undefined → bị bỏ (URL sạch)', () => {
    expect(buildPlpUrl('/search', { sort: 'newest', page: 1, filters: {} }, { q: undefined })).toBe('/search');
  });
});

describe('SEARCH_SUGGESTED_KEYWORDS', () => {
  it('đủ 3 chips mỗi locale (điện thoại / áo thun / sách)', () => {
    expect(SEARCH_SUGGESTED_KEYWORDS.vi).toHaveLength(3);
    expect(SEARCH_SUGGESTED_KEYWORDS.en).toHaveLength(3);
  });
});
