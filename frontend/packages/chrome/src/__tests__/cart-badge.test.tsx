import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { authStore } from '@ecommerce/auth';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CART_CHANGED_EVENT, CartBadge, cartBadgeCount } from '../index';
import type { CartBadgeCart } from '../index';
import { renderWithProviders } from './setup';

/**
 * CartBadge (FI-398 T8, spec §3.6): count = Σ qty qua fetchCart inject
 * (KHÔNG mock network — data-access là prop); refresh lại khi window phát
 * `ecommerce:cart-changed` (CART_CHANGED_EVENT) và khi authStore.subscribe
 * notify (logout → giỏ khác); fetchCart reject → badge 0; pill chỉ khi
 * count > 0; click → onOpen spy; aria-label chrome.cart.aria có count.
 *
 * authStore DÙNG THẬT (singleton — không mock '@ecommerce/auth'): seed qua
 * setToken (pattern authStore.test.ts) + reset null giữa các case; subscribe
 * notify bằng setToken/ logout thật. i18n qua renderWithProviders (setup
 * T13 — P1 critic, lang vi cho assert aria-label tiếng Việt).
 */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (s: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(s)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

beforeEach(() => {
  authStore.setToken(null);
});

afterEach(async () => {
  // act() + flush microtask quanh reset seed: badge còn mounted lúc afterEach
  // (RTL cleanup chạy sau user hooks); setToken → notify → refresh() →
  // fetchCart promise .then(setCount) là MICROTASK sau act sync — cần await
  // trong act để nuốt (P2 W5 — cosmetic, không chase zero-warning).
  await act(async () => {
    authStore.setToken(null);
    await Promise.resolve();
  });
});

describe('cartBadgeCount (Σ qty)', () => {
  it('cộng dồn qty các item; null → 0', () => {
    expect(cartBadgeCount({ items: [{ qty: 2 }, { qty: 3 }] })).toBe(5);
    expect(cartBadgeCount({ items: [] })).toBe(0);
    expect(cartBadgeCount(null)).toBe(0);
  });
});

describe('CartBadge (fetchCart inject)', () => {
  /** Render (renderWithProviders — i18n vi) + flush refresh-mount (promise
   *  fetchCart) BÊN TRONG act — setCount từ microtask ngoài act sinh warning
   *  React (noise test log). setTimeout(0) = macrotask: mọi microtask của
   *  chuỗi promise đã chạy xong trước khi act thoát. */
  async function renderBadge(props: Parameters<typeof CartBadge>[0]) {
    const utils = await renderWithProviders(<CartBadge {...props} />, { lang: 'vi' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return utils;
  }

  it('fetchCart resolves Σ qty → pill hiện 5 + testid giữ nguyên', async () => {
    const fetchCart = vi.fn<() => Promise<CartBadgeCart | null>>().mockResolvedValue({
      items: [{ qty: 2 }, { qty: 3 }]
    });
    await renderBadge({ fetchCart });
    const pill = screen.getByTestId('cart-badge-count');
    expect(pill.textContent).toBe('5');
    expect(screen.getByTestId('cart-badge')).toBeTruthy();
  });

  it('fetchCart resolves null (guest 404) → count 0, KHÔNG pill', async () => {
    const fetchCart = vi.fn<() => Promise<CartBadgeCart | null>>().mockResolvedValue(null);
    await renderBadge({ fetchCart });
    expect(screen.queryByTestId('cart-badge-count')).toBeNull();
  });

  it('fetchCart reject (cart-service chết) → badge 0, không crash', async () => {
    const fetchCart = vi.fn<() => Promise<CartBadgeCart | null>>().mockRejectedValue(new Error('down'));
    await renderBadge({ fetchCart });
    expect(screen.queryByTestId('cart-badge-count')).toBeNull();
  });

  it('dispatch window CustomEvent(CART_CHANGED_EVENT) → fetchCart gọi lại', async () => {
    const fetchCart = vi.fn<() => Promise<CartBadgeCart | null>>().mockResolvedValue({ items: [{ qty: 1 }] });
    await renderBadge({ fetchCart });
    expect(fetchCart).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(fetchCart).toHaveBeenCalledTimes(2));
  });

  it('authStore subscribe notify (setToken → logout flip) → fetchCart gọi lại', async () => {
    const fetchCart = vi.fn<() => Promise<CartBadgeCart | null>>().mockResolvedValue({ items: [{ qty: 1 }] });
    await renderBadge({ fetchCart });
    expect(fetchCart).toHaveBeenCalledTimes(1);

    // login (guest → user): store notify → badge refetch (giỏ user khác guest)
    await act(async () => {
      authStore.setToken(makeJwt({ sub: 'u1', email: 'u@test.dev', roles: [] }));
    });
    await waitFor(() => expect(fetchCart).toHaveBeenCalledTimes(2));
  });

  it('click → onOpen spy gọi; không onOpen → no-op không lỗi', async () => {
    const onOpen = vi.fn();
    const fetchCart = vi.fn<() => Promise<CartBadgeCart | null>>().mockResolvedValue(null);
    const { unmount } = await renderBadge({ fetchCart, onOpen });
    fireEvent.click(screen.getByTestId('cart-badge'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();

    // không onOpen — click không ném (onOpen?.() no-op)
    await renderBadge({ fetchCart });
    fireEvent.click(screen.getByTestId('cart-badge'));
  });

  it('aria-label chrome.cart.aria (mirror shell.cart.aria) chứa count', async () => {
    const fetchCart = vi.fn<() => Promise<CartBadgeCart | null>>().mockResolvedValue({ items: [{ qty: 4 }] });
    await renderBadge({ fetchCart });
    const badge = screen.getByRole('button');
    expect(badge.getAttribute('aria-label')).toBe('Giỏ hàng — 4 sản phẩm');
  });
});
