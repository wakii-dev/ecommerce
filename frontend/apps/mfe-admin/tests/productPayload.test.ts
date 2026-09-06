import { describe, expect, it } from 'vitest';

import { flattenCategories, i18nTextOrNull, slugify, truncateForSeo } from '../src/lib/productPayload';

describe('slugify', () => {
  it('bỏ dấu tiếng Việt + lowercase + dash', () => {
    expect(slugify('Áo Thun Nam Nữ Đẹp')).toBe('ao-thun-nam-nu-dep');
    expect(slugify('đồng hồ thông minh')).toBe('dong-ho-thong-minh');
  });

  it('ký tự lạ thành dash, trim 2 đầu', () => {
    expect(slugify('  Tai Nghe (Bluetooth) 5.0 ')).toBe('tai-nghe-bluetooth-5-0');
    expect(slugify('---')).toBe('');
  });

  it('đ → d cả hoa lẫn thường', () => {
    expect(slugify('Đèn Đọc Sách')).toBe('den-doc-sach');
  });
});

describe('flattenCategories', () => {
  const tree = [
    {
      id: '1',
      name: 'Điện Tử',
      slug: 'dien-tu',
      depth: 0,
      parentId: null,
      children: [
        { id: '2', name: 'Điện Thoại', slug: 'dien-thoai', depth: 1, parentId: '1', children: [] }
      ]
    },
    { id: '3', name: 'Thời Trang', slug: 'thoi-trang', depth: 0, parentId: null, children: [] }
  ] as unknown as Parameters<typeof flattenCategories>[0];

  it('depth-first: cha trước con, thứ tự giữ nguyên', () => {
    const flat = flattenCategories(tree);
    expect(flat.map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(flat.map((c) => c.depth)).toEqual([0, 1, 0]);
  });
});

describe('i18n helpers', () => {
  it('i18nTextOrNull null-safe', () => {
    expect(i18nTextOrNull(null)).toEqual({ vi: '', en: '' });
    expect(i18nTextOrNull({ vi: 'Áo', en: null })).toEqual({ vi: 'Áo', en: '' });
  });

  it('truncateForSeo cắt 160 + ellipsis, không cắt giữa từ', () => {
    const long = 'Sản phẩm chất lượng cao '.repeat(20); // > 160
    const cut = truncateForSeo(long);
    expect(cut.length).toBeLessThanOrEqual(161);
    expect(cut.endsWith('…')).toBe(true);
    expect(truncateForSeo('Ngắn')).toBe('Ngắn');
  });
});
