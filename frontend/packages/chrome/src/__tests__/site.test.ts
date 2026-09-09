import { afterEach, describe, expect, it } from 'vitest';
import { localePath, setChromeSite, sfUrl, shellUrl } from '../site';

/**
 * site.ts helpers (FI-398 T6, spec §3.4): defaults 5173/3000, setChromeSite
 * merge đọc-lúc-gọi, localePath port EXACT storefront lib/format.ts (vi không
 * prefix, en prefix, root /en/, KHÔNG guard idempotent — khớp nguồn).
 *
 * Vitest isolate module per test file → setChromeSite ở đây không ảnh hưởng
 * file khác; afterEach reset về defaults cho các case trong file này.
 */
afterEach(() => {
  setChromeSite({ shellUrl: 'http://localhost:5173', sfUrl: 'http://localhost:3000' });
});

describe('site config helpers (setChromeSite/shellUrl/sfUrl)', () => {
  it('defaults: shell http://localhost:5173, sf http://localhost:3000', () => {
    expect(shellUrl()).toBe('http://localhost:5173');
    expect(sfUrl()).toBe('http://localhost:3000');
  });

  it('setChromeSite merge: override field truyền vào, field bỏ qua giữ nguyên', () => {
    setChromeSite({ sfUrl: 'http://localhost:3500' });
    expect(sfUrl()).toBe('http://localhost:3500');
    expect(shellUrl()).toBe('http://localhost:5173'); // không đụng

    setChromeSite({ shellUrl: '' });
    expect(shellUrl()).toBe(''); // pin shell host: '' = same-origin relative
    expect(sfUrl()).toBe('http://localhost:3500');
  });

  it('setChromeSite sfUrl: undefined = KHÔNG ghi đè default (env unset giữ default)', () => {
    setChromeSite({ sfUrl: undefined as string | undefined });
    expect(sfUrl()).toBe('http://localhost:3000');
  });

  it('đọc-lúc-gọi: helper trả giá trị MỚI sau set (không cache lúc import)', () => {
    expect(sfUrl()).toBe('http://localhost:3000');
    setChromeSite({ sfUrl: 'https://shop.example.com' });
    expect(sfUrl()).toBe('https://shop.example.com');
  });
});

describe('localePath (port EXACT storefront lib/format.ts)', () => {
  it('vi → path nguyên bản, KHÔNG prefix', () => {
    expect(localePath('/c/dien-tu', 'vi')).toBe('/c/dien-tu');
    expect(localePath('/', 'vi')).toBe('/');
    expect(localePath('/account/orders', 'vi')).toBe('/account/orders');
  });

  it('en → prefix /en giữ / dẫn đầu', () => {
    expect(localePath('/c/dien-tu', 'en')).toBe('/en/c/dien-tu');
    expect(localePath('/c/nha-cua?sort=price', 'en')).toBe('/en/c/nha-cua?sort=price');
  });

  it('en root / → /en/ (không /en bare)', () => {
    expect(localePath('/', 'en')).toBe('/en/');
  });

  it('path ĐÃ prefix /en → double-prefix (khớp NGUỒN — localePath không guard; storefront strip qua switchLocalePath trước khi gọi)', () => {
    expect(localePath('/en/c/x', 'en')).toBe('/en/en/c/x');
  });
});
