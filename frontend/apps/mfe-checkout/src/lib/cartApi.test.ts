import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  CART_CHANGED_EVENT,
  addCartItem,
  cartCount,
  mergeGuestCart,
  notifyCartChanged,
  type Cart
} from './cartApi';

// Fetch stub môi trường jsdom — không cần mock server thật.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function cartResponse(overrides: Partial<Cart> = {}): Response {
  const body = { cartToken: null, items: [], subtotal: 0, ...overrides };
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as unknown as Response;
}

describe('cartApi', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cartCount = Σ qty (badge chuẩn Tiki)', () => {
    expect(
      cartCount({
        items: [
          { id: '1', productId: 'p1', qty: 2, unitPrice: 1000, lineTotal: 2000, unavailable: false },
          { id: '2', productId: 'p2', qty: 3, unitPrice: 500, lineTotal: 1500, unavailable: true }
        ],
        subtotal: 2000
      })
    ).toBe(5);
    expect(cartCount(null)).toBe(0);
  });

  it('notifyCartChanged dispatch ecommerce:cart-changed', () => {
    const listener = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, listener);
    notifyCartChanged();
    window.removeEventListener(CART_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('addCartItem OMIT variantId khi null (A1) + slug đi query param + remember token', async () => {
    fetchMock.mockResolvedValueOnce(
      cartResponse({
        cartToken: 'guest-token-1',
        items: [
          {
            id: 'l1',
            productId: 'p1',
            slug: 'ao-thun',
            name: 'Áo thun',
            qty: 1,
            unitPrice: 99000,
            lineTotal: 99000,
            unavailable: false
          }
        ],
        subtotal: 99000
      })
    );

    await addCartItem({ productId: 'p1', qty: 1, slug: 'ao-thun' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/cart/items?slug=ao-thun');
    const body = JSON.parse(String(init.body));
    expect(body).not.toHaveProperty('variantId'); // A1 — omit, không gửi null
    expect(body.qty).toBe(1);
    expect(window.localStorage.getItem('ecommerce.guest_cart_token')).toBe('guest-token-1');
  });

  it('mergeGuestCart 404 → clear token im lặng (giỏ guest hết hạn)', async () => {
    window.localStorage.setItem('ecommerce.guest_cart_token', 'expired-token');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => null } as unknown as Response);

    const result = await mergeGuestCart('expired-token');

    expect(result).toBeNull();
    expect(window.localStorage.getItem('ecommerce.guest_cart_token')).toBeNull();
  });

  it('mergeGuestCart token null (khác port) → body rỗng, server dùng cookie fallback; 400 = nothing-to-merge', async () => {
    window.localStorage.setItem('ecommerce.guest_cart_token', 'stale-other-port');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => null } as unknown as Response);

    const result = await mergeGuestCart(null);

    expect(result).toBeNull();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({}); // rỗng → server cookie fallback
    expect(window.localStorage.getItem('ecommerce.guest_cart_token')).toBeNull();
  });

  it('mergeGuestCart thành công → clear token + trả cart', async () => {
    window.localStorage.setItem('ecommerce.guest_cart_token', 'good-token');
    fetchMock.mockResolvedValueOnce(cartResponse({ items: [], subtotal: 0 }));

    const result = await mergeGuestCart('good-token');

    expect(result).not.toBeNull();
    expect(window.localStorage.getItem('ecommerce.guest_cart_token')).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/cart/merge');
    expect(JSON.parse(String(init.body))).toEqual({ cartToken: 'good-token' });
  });
});
