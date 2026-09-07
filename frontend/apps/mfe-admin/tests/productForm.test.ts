import { describe, expect, it } from 'vitest';

import {
  buildProductWrite,
  emptyProductForm,
  isoToLocalDateTime,
  localDateTimeToIso,
  optionsToText,
  parseOptionsText,
  seoPlaceholders,
  viewToForm,
  type ProductFormState
} from '../src/lib/productForm';

function baseForm(): ProductFormState {
  const form = emptyProductForm();
  return {
    ...form,
    nameVi: 'Áo thun locally',
    nameEn: 'Locally Tee',
    slugVi: 'ao-thun-locally',
    slugEn: 'locally-tee',
    descriptionVi: 'Áo thun chất cotton mát.',
    descriptionEn: 'Cool cotton tee.',
    categoryId: 'cat-1',
    price: '189000',
    status: 'PUBLISHED'
  };
}

describe('parseOptionsText', () => {
  it('parse cú pháp key=value', () => {
    expect(parseOptionsText('color=đỏ, size=XL')).toEqual({ color: 'đỏ', size: 'XL' });
  });

  it('rỗng → {} — sai cú pháp → null', () => {
    expect(parseOptionsText('')).toEqual({});
    expect(parseOptionsText('color')).toBeNull();
    expect(parseOptionsText('color=')).toBeNull();
    expect(parseOptionsText('=đỏ')).toBeNull();
  });

  it('optionsToText round-trip', () => {
    expect(optionsToText({ color: 'đỏ', size: 'XL' })).toBe('color=đỏ, size=XL');
  });
});

describe('datetime helpers', () => {
  it('datetime-local → ISO → round-trip', () => {
    const iso = localDateTimeToIso('2026-09-06T20:00');
    expect(iso).toBeDefined();
    expect(isoToLocalDateTime(iso)).toBe('2026-09-06T20:00');
  });

  it('rỗng → undefined ISO; ISO rỗng → ""', () => {
    expect(localDateTimeToIso('')).toBeUndefined();
    expect(isoToLocalDateTime(undefined)).toBe('');
  });
});

describe('buildProductWrite', () => {
  it('en trống → submit en: "" (D17 fallback vi), official → tags Chính hãng', () => {
    const result = buildProductWrite({ ...baseForm(), nameEn: '', official: true });
    expect(result.errors).toEqual([]);
    expect(result.payload).toMatchObject({
      nameI18n: { vi: 'Áo thun locally', en: '' },
      tags: ['Chính hãng'],
      status: 'PUBLISHED'
    });
  });

  it('seo trống hoàn toàn → undefined; 1 ngôn ngữ có → object với null bên kia', () => {
    const none = buildProductWrite(baseForm());
    expect(none.payload?.seoTitleI18n).toBeUndefined();
    expect(none.payload?.seoDescriptionI18n).toBeUndefined();

    const partial = buildProductWrite({ ...baseForm(), seoTitleVi: 'Mua áo thun' });
    expect(partial.payload?.seoTitleI18n).toEqual({ vi: 'Mua áo thun', en: null });
  });

  it('variants parse options, stock mặc định 0, priceDelta undefined khi trống', () => {
    const result = buildProductWrite({
      ...baseForm(),
      variants: [
        { nameVi: 'Màu sắc', nameEn: 'Color', optionsText: 'color=đỏ', priceDelta: '10000', stock: '5' },
        { nameVi: 'Size', nameEn: 'Size', optionsText: 'size=XL', priceDelta: '', stock: '' },
        { nameVi: 'Sai', nameEn: '', optionsText: 'không có cú pháp', priceDelta: '', stock: '' }
      ]
    });
    expect(result.errors).toEqual(['variant-2']);
    expect(result.payload).toBeNull();
  });

  it('images → position theo thứ tự + bỏ row url rỗng', () => {
    const result = buildProductWrite({
      ...baseForm(),
      images: [
        { url: 'https://x/1.jpg', alt: 'trước' },
        { url: '', alt: 'bỏ' },
        { url: 'https://x/2.jpg', alt: '' }
      ]
    });
    expect(result.payload?.images).toEqual([
      { url: 'https://x/1.jpg', alt: 'trước', position: 0 },
      { url: 'https://x/2.jpg', alt: undefined, position: 1 }
    ]);
  });

  it('thiếu name/category/price → errors + payload null', () => {
    const result = buildProductWrite(emptyProductForm());
    expect(result.errors).toEqual(['nameVi', 'categoryId', 'price']);
    expect(result.payload).toBeNull();
  });

  // FI-368 T8: "1e999" → Number = Infinity lọt payload (JSON → null) —
  // guard finite phải chặn ở price/comparePrice/priceDelta.
  it('guard "1e999" (Infinity): price chặn, comparePrice + priceDelta không lọt payload', () => {
    const price = buildProductWrite({ ...baseForm(), price: '1e999' });
    expect(price.errors).toContain('price');
    expect(price.payload).toBeNull();

    const compare = buildProductWrite({ ...baseForm(), comparePrice: '1e999' });
    expect(compare.errors).toContain('comparePrice');
    expect(compare.payload).toBeNull();

    const delta = buildProductWrite({
      ...baseForm(),
      variants: [
        { nameVi: 'Đỏ', nameEn: 'Red', optionsText: 'color=đỏ', priceDelta: '1e999', stock: '5' },
        { nameVi: 'Xanh', nameEn: 'Blue', optionsText: 'color=xanh', priceDelta: '10000', stock: '3' }
      ]
    });
    expect(delta.errors).toContain('variant-0');
    expect(delta.payload).toBeNull();
  });

  it('slug trống tự sinh từ tên (slugify tiếng Việt)', () => {
    const form = { ...baseForm(), slugVi: '', slugEn: '', nameVi: 'Đèn Đọc Sách', nameEn: '' };
    const result = buildProductWrite(form);
    expect(result.payload?.slugVi).toBe('den-doc-sach');
    expect(result.payload?.slugEn).toBe('den-doc-sach'); // en trống → từ name vi
  });

  it('flashSaleEndsAt → ISO; rỗng → undefined', () => {
    const withFlash = buildProductWrite({ ...baseForm(), flashSaleEndsAt: '2026-09-30T23:59' });
    expect(withFlash.payload?.flashSaleEndsAt).toBe(new Date('2026-09-30T23:59').toISOString());
    expect(buildProductWrite(baseForm()).payload?.flashSaleEndsAt).toBeUndefined();
  });
});

describe('viewToForm (edit round-trip)', () => {
  it('map đủ trường từ ProductAdminView', () => {
    const view = {
      id: 'p1',
      slug: 'ao-thun-locally',
      slugEn: 'locally-tee',
      slugVi: 'ao-thun-locally',
      name: 'Áo thun locally',
      nameI18n: { vi: 'Áo thun locally', en: 'Locally Tee' },
      description: 'desc resolved',
      descriptionI18n: { vi: 'Áo thun chất cotton mát.', en: 'Cool cotton tee.' },
      seoTitleI18n: { vi: 'SEO', en: null },
      seoDescriptionI18n: null,
      brand: 'Locally',
      price: 189000,
      comparePrice: 250000,
      flashSaleEndsAt: '2026-09-30T16:59:00.000Z',
      tags: ['Chính hãng'],
      categoryId: 'cat-1',
      ratingAvg: 4.5,
      ratingCount: 10,
      image: { url: 'https://x/1.jpg', position: 0 },
      images: [
        { url: 'https://x/2.jpg', position: 1 },
        { url: 'https://x/1.jpg', alt: 'chính', position: 0 }
      ],
      variants: [
        {
          id: 'v1',
          name: 'đỏ / XL',
          options: { color: 'đỏ', size: 'XL' },
          priceDelta: 5000,
          stock: 12
        }
      ],
      status: 'PUBLISHED'
    } as unknown as Parameters<typeof viewToForm>[0];

    const form = viewToForm(view);
    expect(form.nameVi).toBe('Áo thun locally');
    expect(form.nameEn).toBe('Locally Tee');
    expect(form.seoTitleVi).toBe('SEO');
    expect(form.seoTitleEn).toBe('');
    expect(form.official).toBe(true);
    expect(form.price).toBe('189000');
    expect(form.images[0]?.url).toBe('https://x/1.jpg'); // sort theo position
    expect(form.variants[0]).toMatchObject({
      nameVi: 'đỏ / XL',
      optionsText: 'color=đỏ, size=XL',
      priceDelta: '5000',
      stock: '12'
    });
    expect(form.status).toBe('PUBLISHED');

    // Round-trip: build lại từ form giữ được các field chính
    const result = buildProductWrite(form);
    expect(result.errors).toEqual([]);
    expect(result.payload).toMatchObject({
      slugVi: 'ao-thun-locally',
      price: 189000,
      tags: ['Chính hãng']
    });
  });
});

describe('seoPlaceholders', () => {
  it('từ tên + mô tả vi', () => {
    const hints = seoPlaceholders({ ...baseForm(), descriptionVi: 'Mô tả dài '.repeat(30) });
    expect(hints.title).toBe('Áo thun locally');
    expect(hints.description.length).toBeLessThanOrEqual(161);
    expect(hints.description.endsWith('…')).toBe(true);
  });
});
