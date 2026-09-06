import { describe, expect, it } from 'vitest';

import { formatVnd, localePath, resolveLocale } from '../lib/format';
import { rewriteTarget } from '../lib/locale-rewrite';
import { buildAlternates, enUsesFallback, pdpMetadata, resolveDescription, resolveTitle } from '../lib/seo';

/** Override process.env.SITE_URL trong 1 khối test, restore sau. */
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

describe('formatVnd', () => {
  it('formats 0 → "0 ₫"', () => {
    expect(formatVnd(0)).toBe('0 ₫');
  });

  it('formats 1_290_000 → "1.290.000 ₫" (dot thousands + space before ₫)', () => {
    expect(formatVnd(1290000)).toBe('1.290.000 ₫');
  });

  it('formats 250500 → "250.500 ₫"', () => {
    expect(formatVnd(250500)).toBe('250.500 ₫');
  });
});

describe('resolveLocale', () => {
  it('accepts vi/en', () => {
    expect(resolveLocale('vi')).toBe('vi');
    expect(resolveLocale('en')).toBe('en');
  });

  it('rejects other/missing segments → null (layout notFound)', () => {
    expect(resolveLocale('fr')).toBeNull();
    expect(resolveLocale(undefined)).toBeNull();
  });
});

describe('localePath', () => {
  it('vi keeps path as-is (no prefix — middleware rewrite handles /vi)', () => {
    expect(localePath('/', 'vi')).toBe('/');
    expect(localePath('/c/foo', 'vi')).toBe('/c/foo');
  });

  it('en prefixes /en preserving leading slash', () => {
    expect(localePath('/c/foo', 'en')).toBe('/en/c/foo');
    expect(localePath('/p/bar', 'en')).toBe('/en/p/bar');
  });

  it('en root → /en/ (plan: không link /en bare)', () => {
    expect(localePath('/', 'en')).toBe('/en/');
  });
});

describe('rewriteTarget (middleware table)', () => {
  it('maps bare public paths → /vi counterpart', () => {
    expect(rewriteTarget('/')).toBe('/vi');
    expect(rewriteTarget('/search')).toBe('/vi/search');
    expect(rewriteTarget('/coupons')).toBe('/vi/coupons');
  });

  it('maps /c/** and /p/** with segments preserved', () => {
    expect(rewriteTarget('/c/dien-tu')).toBe('/vi/c/dien-tu');
    expect(rewriteTarget('/p/ao-thun')).toBe('/vi/p/ao-thun');
  });

  it('passes through /en/** and unknown paths → null', () => {
    expect(rewriteTarget('/en')).toBeNull();
    expect(rewriteTarget('/en/c/foo')).toBeNull();
    expect(rewriteTarget('/vi')).toBeNull();
    expect(rewriteTarget('/random')).toBeNull();
  });
});

describe('buildAlternates', () => {
  it('builds absolute vi/en pair from SITE_URL', () => {
    withSiteUrl('http://test.local', () => {
      expect(buildAlternates('/p/x')).toEqual({
        languages: { vi: 'http://test.local/p/x', en: 'http://test.local/en/p/x' },
      });
    });
  });

  it('defaults to http://localhost:3000 when SITE_URL unset', () => {
    withSiteUrl(undefined, () => {
      expect(buildAlternates('/')).toEqual({
        languages: { vi: 'http://localhost:3000/', en: 'http://localhost:3000/en/' },
      });
    });
  });

  it('supports explicit en path (PDP slug vi ≠ slug en)', () => {
    withSiteUrl('http://test.local', () => {
      expect(buildAlternates('/p/ao-thun', '/p/t-shirt').languages.en).toBe('http://test.local/p/t-shirt');
    });
  });
});

describe('seo priority helpers', () => {
  it('resolveTitle/resolveDescription prefer non-blank seo values', () => {
    expect(resolveTitle('  Title tay  ', 'Fallback')).toBe('Title tay');
    expect(resolveTitle('   ', 'Fallback')).toBe('Fallback');
    expect(resolveDescription(undefined, 'Desc fallback')).toBe('Desc fallback');
  });
});

describe('pdpMetadata', () => {
  const base = { name: 'Áo thun', slug: 'ao-thun', slugEn: 't-shirt', description: 'Áo cotton mát' };
  const viContent = { name: 'Áo thun', description: 'Áo cotton mát' };
  const enContent = { name: 'T-shirt', description: 'Breathable cotton tee' };

  it('uses seoTitle/seoDescription when present — override title/desc GIỮ NGUYÊN', () => {
    const meta = pdpMetadata({ ...base, seoTitle: 'Seo title', seoDescription: 'Seo desc' }, 'en', viContent);
    expect(meta.title).toBe('Seo title');
    expect(meta.description).toBe('Seo desc');
  });

  it('en + THIẾU seo override + nội dung en thật (khác vi) → indexable (fix cũ noindex oan)', () => {
    // Seed products không có seoTitle/seoDescription (admin override) — đây
    // KHÔNG phải fallback; robots chỉ nhìn nội dung so với bản vi.
    const meta = pdpMetadata(base, 'en', enContent);
    expect(meta.title).toBe('Áo thun');
    expect(meta.description).toBe('Áo cotton mát');
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('en + nội dung trùng nguyên vi (name+description) → noindex (duplicate content)', () => {
    expect(pdpMetadata(base, 'en', viContent).robots.index).toBe(false);
  });

  it('en + CHỈ name khác (description trùng) → indexable', () => {
    expect(pdpMetadata(base, 'en', { name: 'T-shirt', description: 'Áo cotton mát' }).robots.index).toBe(true);
  });

  it('en + viProduct null/undefined (vi fetch fail) → ưu tiên indexable (fetch hỏng không phạt SEO)', () => {
    expect(pdpMetadata(base, 'en', null).robots.index).toBe(true);
    expect(pdpMetadata(base, 'en', undefined).robots.index).toBe(true);
  });

  it('vi + nội dung trùng vi → luôn indexable', () => {
    expect(pdpMetadata(base, 'vi', viContent).robots.index).toBe(true);
  });

  it('alternates pair slug vi / slugEn — en URL LUÔN mang prefix /en (Task 13 fix)', () => {
    withSiteUrl('http://test.local', () => {
      const meta = pdpMetadata(base, 'vi');
      expect(meta.alternates.languages).toEqual({
        vi: 'http://test.local/p/ao-thun',
        en: 'http://test.local/en/p/t-shirt',
      });
    });
  });

  it('slugEn vắng → en alternate dùng slug vi nhưng vẫn có prefix /en', () => {
    withSiteUrl('http://test.local', () => {
      const meta = pdpMetadata({ name: 'X', slug: 'x' }, 'en');
      expect(meta.alternates.languages.en).toBe('http://test.local/en/p/x');
      expect(meta.alternates.languages.vi).toBe('http://test.local/p/x');
    });
  });

  it('missing description falls back to name', () => {
    const meta = pdpMetadata({ name: 'X', slug: 'x', seoTitle: 'Seo' }, 'en', enContent);
    expect(meta.description).toBe('X');
    expect(meta.robots.index).toBe(true);
  });
});

describe('enUsesFallback', () => {
  it('true khi name VÀ description identical với bản vi', () => {
    expect(enUsesFallback({ name: 'A', description: 'd' }, { name: 'A', description: 'd' })).toBe(true);
  });

  it('false khi name khác dù description trùng', () => {
    expect(enUsesFallback({ name: 'En', description: 'd' }, { name: 'Vi', description: 'd' })).toBe(false);
  });

  it('false khi description khác dù name trùng', () => {
    expect(enUsesFallback({ name: 'A', description: 'en text' }, { name: 'A', description: 'vi text' })).toBe(false);
  });

  it('undefined description coi như chuỗi rỗng (backend resolve chuỗi rỗng ≠ mất dịch)', () => {
    expect(enUsesFallback({ name: 'A', description: undefined }, { name: 'A', description: '' })).toBe(true);
  });

  it('viProduct null/undefined → false (unknown → ưu tiên indexable)', () => {
    expect(enUsesFallback({ name: 'A', description: 'd' }, null)).toBe(false);
    expect(enUsesFallback({ name: 'A', description: 'd' }, undefined)).toBe(false);
  });
});
