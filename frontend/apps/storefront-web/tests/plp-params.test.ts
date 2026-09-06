import { describe, expect, it } from 'vitest';

import type { Category } from '../lib/catalog-api';
import {
  buildPlpUrl,
  DEFAULT_SORT,
  filtersToApiParams,
  parsePlpSearchParams,
  pageWindow,
  pricePreset,
  PRICE_PRESETS,
  resolveCategoryPath,
  withFilters,
  type PlpQuery,
} from '../lib/plp-params';

const CLEAN: PlpQuery = { sort: DEFAULT_SORT, page: 1, filters: {} };

function category(id: string, overrides: Partial<Category> = {}): Category {
  return {
    id,
    slug: id,
    slugEn: `${id}-en`,
    name: `Danh mục ${id}`,
    parentId: null,
    children: [],
    ...overrides,
  };
}

describe('parsePlpSearchParams', () => {
  it('params hợp lệ → giữ nguyên (page string → int)', () => {
    const query = parsePlpSearchParams({ sort: 'price_asc', page: '3', price: '1m-2m', rating: '4', brand: ' Xiaomi ' });
    expect(query).toEqual({ sort: 'price_asc', page: 3, filters: { price: '1m-2m', rating: 4, brand: 'Xiaomi' } });
  });

  it('rỗng → mặc định newest / page 1 / không filter', () => {
    expect(parsePlpSearchParams({})).toEqual({ sort: 'newest', page: 1, filters: {} });
  });

  it('sort lạ → newest', () => {
    expect(parsePlpSearchParams({ sort: 'DROP TABLE' }).sort).toBe('newest');
  });

  it('page 0 / âm / NaN / garbage → 1', () => {
    expect(parsePlpSearchParams({ page: '0' }).page).toBe(1);
    expect(parsePlpSearchParams({ page: '-2' }).page).toBe(1);
    expect(parsePlpSearchParams({ page: 'abc' }).page).toBe(1);
    expect(parsePlpSearchParams({ page: '1.5' }).page).toBe(1);
  });

  it('price key không nằm trong preset → bỏ filter', () => {
    expect(parsePlpSearchParams({ price: 'free' }).filters.price).toBeUndefined();
    expect(parsePlpSearchParams({ price: '500k-1m' }).filters.price).toBe('500k-1m');
  });

  it('rating ngoài {3,4} → bỏ filter', () => {
    expect(parsePlpSearchParams({ rating: '5' }).filters.rating).toBeUndefined();
    expect(parsePlpSearchParams({ rating: 'hai' }).filters.rating).toBeUndefined();
    expect(parsePlpSearchParams({ rating: '3' }).filters.rating).toBe(3);
  });

  it('brand rỗng / toàn space → bỏ filter; mảng → lấy giá trị đầu', () => {
    expect(parsePlpSearchParams({ brand: '   ' }).filters.brand).toBeUndefined();
    expect(parsePlpSearchParams({ brand: '' }).filters.brand).toBeUndefined();
    expect(parsePlpSearchParams({ brand: ['a', 'b'] }).filters.brand).toBe('a');
    expect(parsePlpSearchParams({ sort: ['rating', 'newest'] }).sort).toBe('rating');
  });
});

describe('pricePresets', () => {
  it('mapping key → minPrice/maxPrice rời nhau (không chồng biên)', () => {
    expect(pricePreset('under-500k')).toMatchObject({ maxPrice: 500000 });
    expect(pricePreset('500k-1m')).toMatchObject({ minPrice: 500001, maxPrice: 1000000 });
    expect(pricePreset('1m-2m')).toMatchObject({ minPrice: 1000001, maxPrice: 2000000 });
    expect(pricePreset('2m-5m')).toMatchObject({ minPrice: 2000001, maxPrice: 5000000 });
    expect(pricePreset('over-5m')).toMatchObject({ minPrice: 5000001 });
  });

  it('label song ngữ vi/en cho đủ 5 preset', () => {
    expect(PRICE_PRESETS).toHaveLength(5);
    for (const preset of PRICE_PRESETS) {
      expect(preset.label.vi.length).toBeGreaterThan(0);
      expect(preset.label.en.length).toBeGreaterThan(0);
    }
  });
});

describe('filtersToApiParams', () => {
  it('preset → minPrice/maxPrice, rating → minRating, brand giữ nguyên', () => {
    expect(filtersToApiParams({ price: '2m-5m', rating: 4, brand: 'Xiaomi' })).toEqual({
      minPrice: 2000001,
      maxPrice: 5000000,
      minRating: 4,
      brand: 'Xiaomi',
    });
  });

  it('filter rỗng → object key vẫn undefined (client tự bỏ khi build query)', () => {
    expect(filtersToApiParams({})).toEqual({ minPrice: undefined, maxPrice: undefined, minRating: undefined, brand: undefined });
  });
});

describe('withFilters', () => {
  it('đổi filter → page reset về 1', () => {
    const query = { ...CLEAN, page: 4, filters: { rating: 3 } };
    expect(withFilters(query, { price: 'under-500k' })).toEqual({
      sort: 'newest',
      page: 1,
      filters: { price: 'under-500k', rating: 3 },
    });
  });

  it('patch undefined → xóa filter (toggle off)', () => {
    const query = { ...CLEAN, filters: { price: '1m-2m', rating: 4 } };
    expect(withFilters(query, { price: undefined }).filters).toEqual({ rating: 4 });
  });
});

describe('buildPlpUrl', () => {
  it('query sạch → path không query string', () => {
    expect(buildPlpUrl('/c/dien-tu', CLEAN)).toBe('/c/dien-tu');
  });

  it('giữ filters + sort + page, bỏ giá trị mặc định', () => {
    const url = buildPlpUrl('/c/dien-tu', {
      sort: 'price_asc',
      page: 2,
      filters: { price: '500k-1m', rating: 3, brand: 'Xiaomi' },
    });
    expect(url).toBe('/c/dien-tu?price=500k-1m&rating=3&brand=Xiaomi&sort=price_asc&page=2');
  });

  it('encode brand có dấu/khoảng trắng (URLSearchParams: space → +); page 1 không xuất hiện', () => {
    const url = buildPlpUrl('/c/dien-tu', { ...CLEAN, filters: { brand: 'Hàng Việt' } });
    expect(url).toBe('/c/dien-tu?brand=H%C3%A0ng+Vi%E1%BB%87t');
    // Server parse ngược (Next searchParams) trả đúng giá trị gốc:
    expect(new URLSearchParams(url.split('?')[1]).get('brand')).toBe('Hàng Việt');
  });

  it('đổi category (sidebar) giữ filters, reset page', () => {
    const query = withFilters({ sort: 'rating', page: 5, filters: { brand: 'a' } }, {});
    expect(buildPlpUrl('/c/thoi-trang', query)).toBe('/c/thoi-trang?brand=a&sort=rating');
  });
});

describe('pageWindow', () => {
  it('totalPages ≤ 7 → liệt kê hết, không ellipsis', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('ở giữa → 1 … ±2 … totalPages', () => {
    expect(pageWindow(5, 12)).toEqual([1, 'ellipsis', 3, 4, 5, 6, 7, 'ellipsis', 12]);
  });

  it('sát đầu → không ellipsis trái', () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 'ellipsis', 12]);
    expect(pageWindow(3, 12)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 12]);
  });

  it('sát cuối → không ellipsis phải', () => {
    expect(pageWindow(12, 12)).toEqual([1, 'ellipsis', 10, 11, 12]);
    expect(pageWindow(11, 12)).toEqual([1, 'ellipsis', 9, 10, 11, 12]);
  });

  it('totalPages ≤ 0 → rỗng', () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });
});

describe('resolveCategoryPath', () => {
  const tree: Category[] = [
    category('dien-tu', {
      name: 'Điện Tử',
      children: [
        category('dien-tu/dien-thoai', { name: 'Điện Thoại', parentId: 'dien-tu', children: [category('dien-tu/dien-thoai/pho-thong')] }),
      ],
    }),
    category('thoi-trang', { slugEn: 'fashion' }),
  ];

  /** path ids hoặc [] khi không thấy — gọn assert, tránh nullable chain. */
  function pathIds(slug: string): string[] {
    return resolveCategoryPath(tree, slug)?.map((node) => node.id) ?? [];
  }

  it('thấy theo slug vi → path gốc → node', () => {
    expect(pathIds('dien-tu')).toEqual(['dien-tu']);
    expect(pathIds('dien-tu/dien-thoai')).toEqual(['dien-tu', 'dien-tu/dien-thoai']);
  });

  it('thấy theo slugEn (en page) + case-insensitive', () => {
    expect(pathIds('fashion')).toEqual(['thoi-trang']);
    expect(pathIds('DIEN-TU')).toEqual(['dien-tu']);
  });

  it('slug lạ → null (PLP vẫn render, breadcrumb fallback)', () => {
    expect(resolveCategoryPath(tree, 'khong-ton-tai')).toBeNull();
    expect(pathIds('khong-ton-tai')).toEqual([]);
  });

  it('đệ quy depth 3', () => {
    expect(pathIds('dien-tu/dien-thoai/pho-thong')).toEqual([
      'dien-tu',
      'dien-tu/dien-thoai',
      'dien-tu/dien-thoai/pho-thong',
    ]);
  });
});
