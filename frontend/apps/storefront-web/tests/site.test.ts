import { afterEach, describe, expect, it } from 'vitest';

import { shellUrl, siteUrl } from '../lib/site';

const ENV_KEY = 'NEXT_PUBLIC_SHELL_URL';
const ORIGINAL = process.env[ENV_KEY];

describe('shellUrl (SF-3 1-origin)', () => {
  afterEach(() => {
    // save/restore env — không rò rỉ override sang test khác
    if (ORIGINAL === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = ORIGINAL;
  });

  it('default rỗng → same-origin relative (link qua entry :3000)', () => {
    delete process.env[ENV_KEY];
    expect(shellUrl()).toBe('');
  });

  it('env override absolute → trả nguyên giá trị (kill-switch 2-origin)', () => {
    process.env[ENV_KEY] = 'http://localhost:5173';
    expect(shellUrl()).toBe('http://localhost:5173');
  });

  it('link shellUrl()+"/cart" với default KHÔNG sinh protocol-relative "//cart"', () => {
    delete process.env[ENV_KEY];
    const cartHref = `${shellUrl()}/cart`;
    expect(cartHref).toBe('/cart');
    expect(cartHref.startsWith('//')).toBe(false);
  });

  it('siteUrl() không đổi — vẫn absolute default :3000', () => {
    delete process.env.SITE_URL;
    expect(siteUrl()).toBe('http://localhost:3000');
  });
});
