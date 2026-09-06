import { describe, expect, it } from 'vitest';

import { earliestFlashEndsAt, rootCategories, splitFlashAndFeatured } from '../lib/home-composition';
import { homeMetadata } from '../lib/seo';
import type { Category, ProductCard } from '../lib/catalog-api';

/** Fixture card — chỉ các field split/sort dùng + tối thiểu render types. */
function card(overrides: Partial<ProductCard> & Pick<ProductCard, 'id'>): ProductCard {
  return {
    slug: overrides.id,
    slugEn: `${overrides.id}-en`,
    name: `Sản phẩm ${overrides.id}`,
    price: 100000,
    ratingAvg: 4,
    ratingCount: 10,
    image: { url: '', alt: undefined },
    tags: [],
    categoryId: 'cat-1',
    ...overrides,
  };
}

function category(overrides: Partial<Category> & Pick<Category, 'id'>): Category {
  return {
    slug: overrides.id,
    slugEn: `${overrides.id}-en`,
    name: overrides.id,
    children: [],
    ...overrides,
  };
}

describe('splitFlashAndFeatured', () => {
  it('mixed: flash items vào rail, còn lại sort rating desc → count desc', () => {
    const items = [
      card({ id: 'a', ratingAvg: 4.0, ratingCount: 100 }),
      card({ id: 'b', flashSaleEndsAt: '2026-09-08T10:00:00Z' }),
      card({ id: 'c', ratingAvg: 4.9, ratingCount: 5 }),
      card({ id: 'd', ratingAvg: 4.9, ratingCount: 900 }),
      card({ id: 'e', flashSaleEndsAt: '2026-09-08T11:00:00Z' }),
    ];
    const { flash, featured } = splitFlashAndFeatured(items);
    expect(flash.map((p) => p.id)).toEqual(['b', 'e']);
    // 4.9 trước; tie 4.9 → count 900 trước 5
    expect(featured.map((p) => p.id)).toEqual(['d', 'c', 'a']);
  });

  it('all flash: rail cap 10, featured rỗng', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      card({ id: `f${i}`, flashSaleEndsAt: '2026-09-08T10:00:00Z', ratingAvg: 4.5 }),
    );
    const { flash, featured } = splitFlashAndFeatured(items);
    expect(flash).toHaveLength(10);
    expect(featured).toEqual([]);
  });

  it('none flash: rail rỗng, featured cap 8', () => {
    const items = Array.from({ length: 14 }, (_, i) => card({ id: `p${i}`, ratingAvg: 3 + (i % 3) * 0.5 }));
    const { flash, featured } = splitFlashAndFeatured(items);
    expect(flash).toEqual([]);
    expect(featured).toHaveLength(8);
    // sort giảm dần theo ratingAvg
    const avgs = featured.map((p) => p.ratingAvg);
    expect([...avgs].sort((x, y) => y - x)).toEqual(avgs);
  });

  it('rating tie hoàn toàn → giữ thứ tự ổn định (sort stable)', () => {
    const items = [
      card({ id: 'first', ratingAvg: 4.5, ratingCount: 10 }),
      card({ id: 'second', ratingAvg: 4.5, ratingCount: 10 }),
      card({ id: 'third', ratingAvg: 4.5, ratingCount: 10 }),
    ];
    const { featured } = splitFlashAndFeatured(items);
    expect(featured.map((p) => p.id)).toEqual(['first', 'second', 'third']);
  });

  it('flashSaleEndsAt rỗng-string/undefined → không tính flash (presence check)', () => {
    const items = [card({ id: 'x', flashSaleEndsAt: '' })];
    const { flash, featured } = splitFlashAndFeatured(items);
    expect(flash).toEqual([]);
    expect(featured.map((p) => p.id)).toEqual(['x']);
  });
});

describe('earliestFlashEndsAt', () => {
  it('trả ISO có epoch nhỏ nhất; bỏ ISO parse-NaN', () => {
    const items = [
      card({ id: 'a', flashSaleEndsAt: '2026-09-08T11:00:00Z' }),
      card({ id: 'b', flashSaleEndsAt: 'not-a-date' }),
      card({ id: 'c', flashSaleEndsAt: '2026-09-08T10:00:00Z' }),
    ];
    expect(earliestFlashEndsAt(items)).toBe('2026-09-08T10:00:00Z');
  });

  it('rỗng hoặc toàn flashSaleEndsAt vắng → undefined', () => {
    expect(earliestFlashEndsAt([])).toBeUndefined();
    expect(earliestFlashEndsAt([card({ id: 'a' })])).toBeUndefined();
  });
});

describe('rootCategories', () => {
  it('chỉ giữ node gốc (parentId null/undefined), bỏ children', () => {
    const child = category({ id: 'child', parentId: 'root-1' });
    const roots = [category({ id: 'root-1', parentId: null, children: [child] }), category({ id: 'root-2' })];
    expect(rootCategories([...roots, child]).map((c) => c.id)).toEqual(['root-1', 'root-2']);
  });
});

describe('homeMetadata', () => {
  it('vi: title.absolute (không áp template layout) + description vi + alternates cặp gốc', () => {
    withSiteUrl('http://test.local', () => {
      const meta = homeMetadata('vi');
      expect(meta.title).toEqual({ absolute: 'Shop VN — Chợ sôi động' });
      expect(meta.description).toContain('chính hãng');
      expect(meta.alternates.languages).toEqual({
        vi: 'http://test.local/',
        en: 'http://test.local/en/',
      });
    });
  });

  it('en: title + description tiếng Anh (override default vi-only của layout)', () => {
    withSiteUrl('http://test.local', () => {
      const meta = homeMetadata('en');
      expect(meta.title.absolute).toBe('Shop VN — Vibrant marketplace');
      expect(meta.description).toContain('official products');
    });
  });
});

/** Override process.env.SITE_URL trong 1 khối test, restore sau (như unit.test.ts). */
function withSiteUrl(url: string | undefined, run: () => void): void {
  const original = process.env.SITE_URL;
  if (url === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = url;
  try {
    run();
  } finally {
    if (original === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = original;
  }
}
