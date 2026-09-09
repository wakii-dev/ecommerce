import { describe, expect, it } from 'vitest';

import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  activeNavIndex,
  resolveAdminRoute,
  resolveGuardState
} from '../src/lib/guard';

describe('resolveGuardState', () => {
  it('guest (chưa đăng nhập) → guest', () => {
    expect(resolveGuardState(false, [])).toBe('guest');
  });

  it('customer (đăng nhập, thiếu admin) → forbidden', () => {
    expect(resolveGuardState(true, ['customer'])).toBe('forbidden');
  });

  it('admin → ok', () => {
    expect(resolveGuardState(true, ['customer', 'admin'])).toBe('ok');
  });

  it('role ADMIN uppercase từ identity JWT → ok (case-insensitive)', () => {
    expect(resolveGuardState(true, ['ADMIN'])).toBe('ok');
  });
});

describe('resolveAdminRoute', () => {
  it('/admin và /admin/dashboard → dashboard', () => {
    expect(resolveAdminRoute('/admin').page).toBe('dashboard');
    expect(resolveAdminRoute('/admin/').page).toBe('dashboard');
    expect(resolveAdminRoute('/admin/dashboard').page).toBe('dashboard');
  });

  it('products list / new / edit', () => {
    expect(resolveAdminRoute('/admin/products').page).toBe('products');
    expect(resolveAdminRoute('/admin/products/new').page).toBe('product-new');
    const edit = resolveAdminRoute('/admin/products/p-123');
    expect(edit.page).toBe('product-edit');
    expect(edit.id).toBe('p-123');
  });

  it('orders list / detail', () => {
    expect(resolveAdminRoute('/admin/orders').page).toBe('orders');
    const detail = resolveAdminRoute('/admin/orders/o-9');
    expect(detail.page).toBe('order-detail');
    expect(detail.id).toBe('o-9');
  });

  it('các trang phẳng', () => {
    expect(resolveAdminRoute('/admin/categories').page).toBe('categories');
    expect(resolveAdminRoute('/admin/coupons').page).toBe('coupons');
    expect(resolveAdminRoute('/admin/reviews').page).toBe('reviews');
  });

  it('path lạ → not-found', () => {
    expect(resolveAdminRoute('/admin/whatever/deep').page).toBe('not-found');
  });
});

describe('activeNavIndex', () => {
  it('dashboard → 0', () => {
    expect(activeNavIndex('/admin')).toBe(0);
  });

  it('product edit vẫn active nav Products (1)', () => {
    expect(activeNavIndex('/admin/products/p-1')).toBe(1);
  });

  it('order detail vẫn active nav Orders (5)', () => {
    expect(activeNavIndex('/admin/orders/o-1')).toBe(5);
  });
});

describe('ADMIN_NAV_GROUPS ↔ ADMIN_NAV parity (review G1 P1)', () => {
  it('set `to` khớp CHÍNH XÁC (không thiếu/thừa/typo) + key khớp theo `to`', () => {
    const navByTo = new Map(ADMIN_NAV.map((item) => [item.to, item]));
    const groupTos = ADMIN_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));
    expect([...groupTos].sort()).toEqual([...navByTo.keys()].sort());
    for (const group of ADMIN_NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.key, `key của ${item.to} phải khớp entry ADMIN_NAV cùng \`to\``).toBe(
          navByTo.get(item.to)?.key
        );
      }
    }
  });
});
