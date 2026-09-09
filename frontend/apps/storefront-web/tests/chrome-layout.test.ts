import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// P2-1 critic: mock ĐỦ module next/navigation (next/link tự gọi useRouter)
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'vi' }),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  useSelectedLayoutSegment: () => undefined,
  useSelectedLayoutSegments: () => [],
}));

import ChromeShell from '../components/ChromeShell';
import { initI18n } from '@ecommerce/i18n';

beforeAll(async () => {
  await initI18n({ lang: 'vi' });
});

/** Render ChromeShell — children là <main> giả thay page tree. */
function renderShell(): string {
  // children qua props (không rest-arg): React types bắt children required
  // trong P — overload 3-arg không khớp (TS2769).
  return renderToStaticMarkup(
    createElement(ChromeShell, { locale: 'vi', children: createElement('main', null, 'page-body') })
  );
}

describe('chrome layout swap (SF-4 pack item 7 — markup nguồn chrome)', () => {
  it('header scaffolding chrome + slots + row2 mini-nav', () => {
    const html = renderShell();
    expect(html).toContain('chrome-header');
    expect(html).toContain('data-slot="left"');
    expect(html).toContain('data-slot="center"');
    expect(html).toContain('data-slot="right"');
    expect(html).toContain('chrome-header__row2');
    expect(html).toContain('mini-nav');
  });

  it('nav links trong HTML đầu (SSR — nav-honesty/SEO): /cart, /account, /c/dien-tu', () => {
    const html = renderShell();
    expect(html).toContain('href="/cart"');
    expect(html).toContain('href="/account"');
    expect(html).toContain('/c/dien-tu');
  });

  it('labels dịch qua useT (không provider) — chrome.header.aria + COPY storefront giữ', () => {
    const html = renderShell();
    expect(html).toContain('Trang chủ'); // chrome.header.aria
    expect(html).toContain('Giỏ hàng');  // lib/i18n COPY (island giữ)
  });

  it('footer chrome + newsletter island giữ trong band', () => {
    const html = renderShell();
    expect(html).toContain('chrome-site-footer');
    expect(html).toContain('site-footer--chrome');
    expect(html).toContain('Đăng ký nhận tin'); // NewsletterForm (SF-13 island)
  });
});
