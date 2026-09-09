import { renderToStaticMarkup } from 'react-dom/server';
import { initI18n } from '@ecommerce/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { SiteHeader } from '../index';

/**
 * SiteHeader SSR contract (FI-398 T5, spec §3.2 + §5.3 — evidence ACCEPTANCE 3):
 * renderToStaticMarkup sạch server-side — links trong HTML (SEO/nav-honesty),
 * KHÔNG crash, KHÔNG đụng window/matchMedia lúc render ('use client' vẫn được
 * Next server-render HTML đầu).
 *
 * Registry: vitest isolate module per file → registry RỖNG trong file này —
 * đúng điều kiện "server render registry rỗng → chỉ props links (deterministic)".
 */
beforeAll(async () => {
  await initI18n();
});

describe('SiteHeader SSR (renderToStaticMarkup)', () => {
  it('(a) props slots + row2 render vào HTML — links giữ nguyên, không crash', () => {
    const html = renderToStaticMarkup(
      <SiteHeader
        slots={{ left: [() => <a href="/x">X</a>] }}
        row2={<nav>row</nav>}
      />
    );
    expect(html).toContain('<a href="/x"'); // props link trong HTML (SEO)
    expect(html).toContain('>X</a>');
    expect(html).toContain('<nav>row</nav>'); // row2 markup
    expect(html).toContain('chrome-header__row2');
  });

  it('(b) pure SiteHeader + registry RỖNG → chỉ scaffolding (deterministic)', () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('chrome-header');
    expect(html).toContain('chrome-header__row1');
    expect(html).not.toContain('<a '); // không link nào khi không props/registry
    expect(html).not.toContain('chrome-header__row2'); // không row2 khi không truyền
  });

  it('(c) output chứa data-slot attributes (anatomy FI-393 T2 giữ nguyên)', () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('data-slot="left"');
    expect(html).toContain('data-slot="center"');
    expect(html).toContain('data-slot="right"');
  });

  it('aria-label dịch thật server-side (chrome.header.aria = Trang chủ)', () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('aria-label="Trang chủ"');
  });
});
