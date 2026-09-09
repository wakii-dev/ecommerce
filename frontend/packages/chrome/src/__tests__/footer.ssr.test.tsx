import { renderToStaticMarkup } from 'react-dom/server';
import { initI18n } from '@ecommerce/i18n';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Footer, setChromeSite } from '../index';

/**
 * Footer SSR contract (FI-398 T6, spec §3.3 + §5.3): renderToStaticMarkup
 * sạch server-side — 5 link Danh mục (sfUrl + localePath) + 5 link Tài khoản
 * (shellUrl) trong HTML, labels chrome.footer.* dịch thật, không crash.
 *
 * Override config trong test: shellUrl '' (pin shell host — same-origin
 * relative) + sfUrl Rig port để thấy rõ computation href.
 * i18n pattern Wave 3: initI18n() → useT đọc instance default (vi).
 *
 * Palette pin (spec §4 amendment a7e805d — review W4 P1): chrome.css đổi cách
 * GHÉP màu footer (--chrome-footer-* legacy hex thay mapping token) — SSR
 * KHÔNG đọc computed css nên markup KHÔNG đổi; các assert dưới đây chính là
 * guard "class + style không đổi markup". Không test css values (ngoài tầm
 * renderToStaticMarkup — thuộc browser evidence T14).
 */
beforeAll(async () => {
  await initI18n();
  setChromeSite({ shellUrl: '', sfUrl: 'http://localhost:3500' }); // rig +500
});

afterAll(() => {
  // trả config về defaults + lang vi (vitest isolate per file nhưng để sạch)
  setChromeSite({ shellUrl: 'http://localhost:5173', sfUrl: 'http://localhost:3000' });
});

describe('Footer SSR (renderToStaticMarkup)', () => {
  it('render sạch: chrome-site-footer + chrome-container + 2 cột h4 (không crash)', () => {
    const html = renderToStaticMarkup(<Footer />);
    expect(html).toContain('chrome-site-footer');
    expect(html).toContain('chrome-container');
    expect(html).toContain('chrome-site-footer__inner');
    expect(html).toContain('<h4>Danh mục nổi bật</h4>'); // chrome.footer.colCategories (vi)
    expect(html).toContain('<h4>Tài khoản</h4>'); // chrome.footer.colAccount
  });

  it('5 link Danh mục: sfUrl + localePath (vi KHÔNG prefix)', () => {
    const html = renderToStaticMarkup(<Footer />);
    expect(html).toContain('href="http://localhost:3500/c/dien-tu"');
    expect(html).toContain('href="http://localhost:3500/c/thoi-trang"');
    expect(html).toContain('href="http://localhost:3500/c/nha-cua"');
    expect(html).toContain('href="http://localhost:3500/c/sach"');
    expect(html).toContain('href="http://localhost:3500/c/lam-dep"');
  });

  it('5 link Tài khoản: shellUrl() + path (shellUrl \'\')  → same-origin relative', () => {
    const html = renderToStaticMarkup(<Footer />);
    expect(html).toContain('href="/cart"');
    expect(html).toContain('href="/account"');
    expect(html).toContain('href="/account/orders"');
    expect(html).toContain('href="/account/wishlist"');
    expect(html).toContain('href="/account/reviews"');
  });

  it('labels chrome.footer.* dịch thật (vi)', () => {
    const html = renderToStaticMarkup(<Footer />);
    expect(html).toContain('Điện Tử');
    expect(html).toContain('Thời Trang');
    expect(html).toContain('Nhà Cửa');
    expect(html).toContain('Sách');
    expect(html).toContain('Làm Đẹp');
    expect(html).toContain('Giỏ hàng');
    expect(html).toContain('Sản phẩm yêu thích');
    expect(html).toContain('Đánh giá của tôi');
  });

  it('lang en: Danh mục prefix /en qua localePath, Tài khoản shellUrl không đổi', async () => {
    const i18n = await initI18n();
    await i18n.changeLanguage('en');
    try {
      const html = renderToStaticMarkup(<Footer />);
      expect(html).toContain('href="http://localhost:3500/en/c/dien-tu"'); // en prefix
      expect(html).toContain('<h4>Top categories</h4>');
      expect(html).toContain('href="/cart"'); // shell link KHÔNG theo locale
    } finally {
      await i18n.changeLanguage('vi');
    }
  });
});
