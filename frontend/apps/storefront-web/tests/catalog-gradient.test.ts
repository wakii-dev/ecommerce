import { describe, expect, it } from 'vitest';

import { categoryGradient } from '../lib/catalog-api';
import { productGradient } from '../components/ProductCardView';

/**
 * Gradient placeholder theo danh mục — token `--grad-cat-*` (§1.8, ui-kit
 * tokens.css). Guard chống hồi quy về token app-level cũ đã chết
 * (`--grad-electronics/fashion/home/books/beauty`).
 */

const NEW_TOKENS = [
  'var(--grad-cat-dientu)',
  'var(--grad-cat-thoitrang)',
  'var(--grad-cat-nhacua)',
  'var(--grad-cat-sach)',
  'var(--grad-cat-lamdep)',
];

describe('categoryGradient — map slug → token --grad-cat-*', () => {
  it.each([
    ['dien-tu', 'var(--grad-cat-dientu)'],
    ['electronics', 'var(--grad-cat-dientu)'],
    ['thoi-trang', 'var(--grad-cat-thoitrang)'],
    ['fashion', 'var(--grad-cat-thoitrang)'],
    ['nha-cua', 'var(--grad-cat-nhacua)'],
    ['home', 'var(--grad-cat-nhacua)'],
    ['sach', 'var(--grad-cat-sach)'],
    ['book', 'var(--grad-cat-sach)'],
    ['books', 'var(--grad-cat-sach)'],
    ['lam-dep', 'var(--grad-cat-lamdep)'],
    ['beauty', 'var(--grad-cat-lamdep)'],
  ])('%s → %s', (slug, expected) => {
    expect(categoryGradient(slug)).toBe(expected);
  });

  it('slug hoa/thường vẫn map (normalize lowercase)', () => {
    expect(categoryGradient('Dien-Tu')).toBe('var(--grad-cat-dientu)');
  });

  it('slug lạ → fallback token mới (--grad-cat-dientu), không token cũ', () => {
    expect(categoryGradient('khong-biet')).toBe('var(--grad-cat-dientu)');
  });
});

describe('productGradient — hash id → 1 trong 5 token mới', () => {
  it('luôn trả token --grad-cat-* (không var chết --grad-electronics...)', () => {
    for (let i = 0; i < 50; i += 1) {
      const gradient = productGradient(`prod-${i}`);
      expect(NEW_TOKENS).toContain(gradient);
      expect(gradient).not.toContain('--grad-electronics');
      expect(gradient).not.toContain('--grad-fashion');
      expect(gradient).not.toContain('--grad-home');
      expect(gradient).not.toContain('--grad-books');
      expect(gradient).not.toContain('--grad-beauty');
    }
  });

  it('deterministic per key', () => {
    expect(productGradient('abc')).toBe(productGradient('abc'));
  });
});
