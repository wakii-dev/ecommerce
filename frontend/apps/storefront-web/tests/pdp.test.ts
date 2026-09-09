import { describe, expect, it } from 'vitest';

import { buildAddItemPayload } from '../components/pdp/AddToCart';
import type { Category } from '../lib/catalog-api';
import { breadcrumbJsonld, categoryPathById, collectOptions, jsonLdFor, pickVariant, priceWithDelta } from '../lib/pdp';

/** Variant fixture tối giản (options + delta) — phần PDP helpers chỉ dùng 2 trường này. */
function variant(id: string, options: Record<string, string>, priceDelta?: number) {
  return { id, name: Object.values(options).join(' / '), options, priceDelta, stock: 5 };
}

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

const BASE_INPUT = {
  name: 'Xiaomi Redmi 13C',
  slug: 'dien-thoai-xiaomi-redmi-13c',
  slugEn: 'xiaomi-redmi-13c-phone',
  description: 'Điện thoại giá rẻ pin trâu',
  brand: 'Xiaomi',
  image: { url: '/media/a.jpg', alt: 'Redmi' },
  price: 2900000,
  ratingAvg: 4.5,
  ratingCount: 120,
};

describe('jsonLdFor', () => {
  it('đầy đủ field: name vi + image + brand + sku slug-vi + offers VND + availability', () => {
    const jsonLd = jsonLdFor(BASE_INPUT, 'vi', 'http://test.local') as Record<string, any>;
    expect(jsonLd['@type']).toBe('Product');
    expect(jsonLd.name).toBe('Xiaomi Redmi 13C');
    expect(jsonLd.image).toBe('/media/a.jpg');
    expect(jsonLd.brand).toEqual({ '@type': 'Brand', name: 'Xiaomi' });
    expect(jsonLd.sku).toBe('dien-thoai-xiaomi-redmi-13c');
    expect(jsonLd.offers).toMatchObject({
      '@type': 'Offer',
      price: '2900000', // String(price) theo schema.org
      priceCurrency: 'VND',
      availability: 'https://schema.org/InStock',
      url: 'http://test.local/p/dien-thoai-xiaomi-redmi-13c',
    });
  });

  it('aggregateRating CHỈ khi ratingCount > 0', () => {
    const withRating = jsonLdFor(BASE_INPUT, 'vi', 'http://test.local') as Record<string, any>;
    expect(withRating.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      reviewCount: 120,
    });

    const noRating = jsonLdFor({ ...BASE_INPUT, ratingCount: 0 }, 'vi', 'http://test.local') as Record<string, any>;
    expect('aggregateRating' in noRating).toBe(false);
  });

  it('url rỗng → KHÔNG có key image (không nhét chuỗi rỗng)', () => {
    const jsonLd = jsonLdFor({ ...BASE_INPUT, image: { url: '' } }, 'vi', 'http://test.local') as Record<string, any>;
    expect('image' in jsonLd).toBe(false);
  });

  it('locale en → offers.url prefix /en; slug theo locale (contract: slug đã resolve)', () => {
    // En page: API resolve slug = slugEn (truyền đúng shape thật của ProductDetail).
    const jsonLd = jsonLdFor({ ...BASE_INPUT, slug: 'xiaomi-redmi-13c-phone' }, 'en', 'http://test.local') as Record<string, any>;
    expect(jsonLd.offers.url).toBe('http://test.local/en/p/xiaomi-redmi-13c-phone');
    expect(jsonLd.sku).toBe('xiaomi-redmi-13c-phone');
  });

  it('JSON.stringify toàn khối luôn thành công (dữ liệu API bất hợp lý cũng không ném)', () => {
    const jsonLd = jsonLdFor({ ...BASE_INPUT, description: 'Dấu nháy " và <script>' }, 'vi', 'http://test.local');
    expect(() => JSON.stringify(jsonLd)).not.toThrow();
  });

  it('P0 XSS: field chứa `</script>` → chuỗi script render KHÔNG còn raw `<` (escape \\u003c)', () => {
    // Cùng transform với app/[locale]/p/[slug]/page.tsx — lock contract escape.
    const jsonLd = jsonLdFor(
      { ...BASE_INPUT, name: 'X </script><img src=x onerror=alert(1)>' },
      'vi',
      'http://test.local',
    );
    const raw = JSON.stringify(jsonLd);
    expect(raw).toContain('</script>'); // stringify thô vẫn có — nên page BẮT BUỘC escape
    const rendered = raw.replace(/</g, '\\u003c');
    expect(rendered).not.toContain('<'); // không còn `<` raw nào → không thể đóng thẻ script
    expect(rendered).toContain('\\u003c');
    // Escape chỉ ở tầng chuỗi script — JSON vẫn parse về đúng giá trị gốc.
    expect(JSON.parse(rendered.replace(/\\u003c/g, '<')).name).toBe('X </script><img src=x onerror=alert(1)>');
  });
});

describe('breadcrumbJsonld', () => {
  const items = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Điện Tử', path: '/c/dien-tu' },
    { name: 'Điện Thoại', path: '/c/dien-thoai' },
  ];

  it('BreadcrumbList + ListItem position 1..n + item = URL absolute origin+path (item cuối = trang hiện tại)', () => {
    const parsed = JSON.parse(breadcrumbJsonld(items, 'http://test.local')) as Record<string, any>;
    expect(parsed['@type']).toBe('BreadcrumbList');
    expect(parsed.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: 'http://test.local/' },
      { '@type': 'ListItem', position: 2, name: 'Điện Tử', item: 'http://test.local/c/dien-tu' },
      { '@type': 'ListItem', position: 3, name: 'Điện Thoại', item: 'http://test.local/c/dien-thoai' },
    ]);
  });

  it('P0 XSS: tên danh mục chứa `</script>` → chuỗi trả về KHÔNG còn raw `<` (escape <) mà JSON.parse vẫn đúng', () => {
    // Tên danh mục là admin-enter — page nhúng thẳng chuỗi này vào script tag.
    const raw = breadcrumbJsonld(
      [{ name: 'X </script><img src=x onerror=alert(1)>', path: '/c/x' }],
      'http://test.local',
    );
    expect(raw).not.toContain('<'); // không thể đóng sớm thẻ script
    expect(raw).toContain('\\u003c');
    // `<` là escape chuẩn JSON — parse trực tiếp ra đúng giá trị gốc.
    const parsed = JSON.parse(raw) as Record<string, any>;
    expect(parsed.itemListElement[0].name).toBe('X </script><img src=x onerror=alert(1)>');
  });
});

describe('buildAddItemPayload', () => {
  it('payload theo cart contract AddItemRequest: `qty` (không quantity); variantId string khi đã chọn', () => {
    expect(buildAddItemPayload('p1', 'v9', 3)).toEqual({ productId: 'p1', variantId: 'v9', qty: 3 });
  });

  it('chưa chọn variant → OMIT variantId (không gửi null — contract: string khi có mặt)', () => {
    const payload = buildAddItemPayload('p1', null, 1);
    expect(payload).toEqual({ productId: 'p1', qty: 1 });
    expect('variantId' in payload).toBe(false);
  });
});

describe('priceWithDelta', () => {
  it('base + delta; delta vắng → nguyên giá; delta âm được chấp nhận', () => {
    expect(priceWithDelta(1000000, 50000)).toBe(1050000);
    expect(priceWithDelta(1000000, undefined)).toBe(1000000);
    expect(priceWithDelta(1000000, -20000)).toBe(980000);
  });
});

describe('pickVariant', () => {
  const variants = [
    variant('v1', { color: 'Đen', size: 'M' }, 0),
    variant('v2', { color: 'Đen', size: 'L' }, 50000),
    variant('v3', { color: 'Trắng', size: 'L' }, 30000),
  ];

  it('khớp đủ color+size → variant đầu tiên', () => {
    expect(pickVariant(variants, { color: 'Đen', size: 'L' })?.id).toBe('v2');
  });

  it('null = chưa chọn → khớp bất kỳ (color null + size L → v2)', () => {
    expect(pickVariant(variants, { color: null, size: 'L' })?.id).toBe('v2');
    expect(pickVariant(variants, {})?.id).toBe('v1');
  });

  it('combo không tồn tại → null', () => {
    expect(pickVariant(variants, { color: 'Trắng', size: 'M' })).toBeNull();
  });

  it('options ngoài color/size không cản trở match', () => {
    const extra = [variant('v4', { color: 'Xanh', material: ' cotton ' })];
    expect(pickVariant(extra, { color: 'Xanh', size: null })?.id).toBe('v4');
  });
});

describe('collectOptions', () => {
  it('giá trị phân biệt giữ thứ tự xuất hiện; bỏ key vắng/rỗng', () => {
    const variants = [
      variant('a', { color: 'Đen' }),
      variant('b', { color: 'Trắng' }),
      variant('c', { color: 'Đen' }),
      variant('d', {}),
    ];
    expect(collectOptions(variants, 'color')).toEqual(['Đen', 'Trắng']);
    expect(collectOptions(variants, 'size')).toEqual([]);
  });
});

describe('categoryPathById', () => {
  const tree: Category[] = [
    category('dien-tu', {
      name: 'Điện Tử',
      children: [category('dien-thoai', { name: 'Điện Thoại', parentId: 'dien-tu', children: [category('pho-thong')] })],
    }),
    category('thoi-trang'),
  ];

  it('path gốc → node theo ID (đệ quy)', () => {
    expect(categoryPathById(tree, 'pho-thong')?.map((node) => node.id)).toEqual(['dien-tu', 'dien-thoai', 'pho-thong']);
    expect(categoryPathById(tree, 'thoi-trang')?.map((node) => node.id)).toEqual(['thoi-trang']);
  });

  it('ID lạ → null (breadcrumb fallback)', () => {
    expect(categoryPathById(tree, 'khong-co')).toBeNull();
  });
});
