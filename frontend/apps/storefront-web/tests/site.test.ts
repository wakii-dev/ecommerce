import { describe, expect, it } from 'vitest';

import { shellUrl, siteUrl } from '../lib/site';

describe('shellUrl (SF-4 — same-origin tuyệt đối, kill-switch đã xóa)', () => {
  it('luôn rỗng → link relative qua entry :3000', () => {
    expect(shellUrl()).toBe('');
  });

  it('link shellUrl()+"/cart" KHÔNG sinh protocol-relative "//cart"', () => {
    const cartHref = `${shellUrl()}/cart`;
    expect(cartHref).toBe('/cart');
    expect(cartHref.startsWith('//')).toBe(false);
  });

  it('siteUrl() không đổi — vẫn absolute default :3000', () => {
    delete process.env.SITE_URL;
    expect(siteUrl()).toBe('http://localhost:3000');
  });
});
