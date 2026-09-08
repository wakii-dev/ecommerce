import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { initI18n } from '@ecommerce/i18n';
import MiniCartDrawer, { drawerBodyState } from './MiniCartDrawer';
import type { Cart, CartItem } from './lib/cartApi';

/**
 * FI-393 T3 + review-G2 — mfe-checkout KHÔNG có @testing-library (dep freeze):
 * verify logic-level qua renderToStaticMarkup + pure function.
 * Drawer open=true KHÔNG render trực tiếp được: useOverlay tạo container
 * (jsdom có `document`) → createPortal NÉM lỗi trong server render. Nên branch
 * body tách thành `drawerBodyState()` pure trong MiniCartDrawer.tsx — unit-test
 * từng nhánh ở đây, SSR chỉ giữ smoke closed-state (portal guard).
 */

const mkItem = (over: Partial<CartItem> = {}): CartItem => ({
  id: 'i1',
  productId: 'p1',
  name: 'Áo thun demo',
  qty: 1,
  unitPrice: 120000,
  lineTotal: 120000,
  unavailable: false,
  ...over
});

const mkCart = (items: CartItem[]): Cart => ({
  items,
  subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0)
});

describe('drawerBodyState', () => {
  it('loading=true → loading (skeleton), kể cả khi có error/cart cũ', () => {
    expect(drawerBodyState({ loading: true, error: null, cart: null })).toBe('loading');
    expect(drawerBodyState({ loading: true, error: 'boom', cart: null })).toBe('loading');
    expect(
      drawerBodyState({ loading: true, error: null, cart: mkCart([mkItem()]) })
    ).toBe('loading');
  });

  it('error && !cart → error (KHÔNG rơi vào empty "giỏ trống")', () => {
    expect(drawerBodyState({ loading: false, error: 'Network failed', cart: null })).toBe('error');
  });

  it('error nhưng cart vẫn có (lỗi mutation giữ cart cũ) → không error', () => {
    expect(
      drawerBodyState({ loading: false, error: '409 vượt tồn kho', cart: mkCart([mkItem()]) })
    ).toBe('items');
    expect(
      drawerBodyState({ loading: false, error: '409', cart: mkCart([]) })
    ).toBe('empty');
  });

  it('cart=null KHÔNG error (guest 404 — empty hợp lệ) + cart rỗng → empty', () => {
    expect(drawerBodyState({ loading: false, error: null, cart: null })).toBe('empty');
    expect(drawerBodyState({ loading: false, error: null, cart: mkCart([]) })).toBe('empty');
  });

  it('cart có item → items', () => {
    expect(drawerBodyState({ loading: false, error: null, cart: mkCart([mkItem()]) })).toBe('items');
  });
});

describe('MiniCartDrawer', () => {
  it('open=false → markup rỗng (không portal lúc SSR, không crash)', async () => {
    await initI18n();
    const html = renderToStaticMarkup(
      <MiniCartDrawer open={false} onClose={() => undefined} />
    );
    expect(html).toBe('');
  });
});
