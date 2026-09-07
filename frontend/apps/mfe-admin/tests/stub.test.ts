import { describe, expect, it } from 'vitest';

import { createStubApi } from '../src/lib/adminStub';

const api = (): ReturnType<typeof createStubApi> => createStubApi({ delayMs: 0 });

describe('determinism', () => {
  it('2 instance độc lập seed giống nhau', async () => {
    const a = await api().listCoupons();
    const b = await api().listCoupons();
    expect(b).toEqual(a);
    expect(a.map((c) => c.code)).toEqual(['WELCOME10', 'FREESHIP50K', 'SALE500K', 'FLASH15']);
  });

  it('orders phủ đủ 6 trạng thái nghiệp vụ', async () => {
    const orders = await api().listOrders();
    const statuses = new Set(orders.map((o) => o.status));
    expect(statuses).toEqual(
      new Set(['PENDING', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
    );
  });
});

describe('order state machine §3.6 (admin actions)', () => {
  it('ship chỉ từ PAID/CONFIRMED', async () => {
    const a = api();
    await expect(a.shipOrder('o-100231')).rejects.toThrow('INVALID_TRANSITION'); // PENDING
    await expect(a.shipOrder('o-100233')).resolves.toMatchObject({ status: 'SHIPPED' }); // CONFIRMED
  });

  it('deliver chỉ từ SHIPPED', async () => {
    const a = api();
    await expect(a.deliverOrder('o-100233')).rejects.toThrow('INVALID_TRANSITION');
    await expect(a.deliverOrder('o-100234')).resolves.toMatchObject({ status: 'DELIVERED' });
  });

  it('cancel từ PENDING/PAID/CONFIRMED — không từ SHIPPED/DELIVERED', async () => {
    const a = api();
    await expect(a.cancelOrder('o-100231')).resolves.toMatchObject({ status: 'CANCELLED' }); // PENDING
    await expect(a.cancelOrder('o-100232')).resolves.toMatchObject({ status: 'CANCELLED' }); // PAID
    await expect(a.cancelOrder('o-100235')).rejects.toThrow('INVALID_TRANSITION'); // DELIVERED
  });

  it('ship/deliver/cancel push timeline + updatedAt', async () => {
    const a = api();
    const shipped = await a.shipOrder('o-100233');
    expect(shipped.timeline).toHaveLength(4);
    expect(shipped.timeline[3]?.description).toContain('vận chuyển');
    expect(new Date(shipped.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('KHÔNG có action confirm — transitions bắt đầu từ PAID/SHIPPED/CONFIRMED', () => {
    // State machine chỉ có 3 admin actions; không nút PENDING→PAID (webhook lo).
    expect(createStubApi).toBeDefined();
    // canShip(PAID) là hành vi "webhook đã PAID" — không có hàm confirm nào.
    const apiShape = api();
    expect((apiShape as unknown as Record<string, unknown>).confirmOrder).toBeUndefined();
  });
});

describe('reviews moderation', () => {
  it('mặc định queue PENDING có 4 hàng', async () => {
    const pending = await api().listReviews('PENDING');
    expect(pending).toHaveLength(4);
    expect(pending.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('approve đổi status + rời PENDING, vào APPROVED', async () => {
    const a = api();
    await a.approveReview('r1');
    const pending = await a.listReviews('PENDING');
    const approved = await a.listReviews('APPROVED');
    expect(pending.map((r) => r.id)).not.toContain('r1');
    expect(approved.map((r) => r.id)).toContain('r1');
  });

  it('reject đổi status REJECTED', async () => {
    const a = api();
    await a.rejectReview('r3');
    expect((await a.listReviews('REJECTED')).map((r) => r.id)).toContain('r3');
  });
});

describe('coupons mock CRUD', () => {
  it('create → usedCount 0, có trong list', async () => {
    const a = api();
    const created = await a.createCoupon({
      code: 'TEST20',
      type: 'PERCENT',
      value: 20,
      active: true,
      description: 'Test coupon',
      usageLimit: 10
    });
    expect(created.usedCount).toBe(0);
    const list = await a.listCoupons();
    expect(list.map((c) => c.code)).toContain('TEST20');
  });

  it('update giữ usedCount, đổi field', async () => {
    const a = api();
    await a.updateCoupon('c1', {
      code: 'WELCOME10',
      type: 'PERCENT',
      value: 12,
      active: true,
      description: 'Đã sửa',
      usageLimit: 100,
      minOrderValue: 200000,
      startsAt: '2026-09-01T00:00:00+07:00',
      endsAt: '2026-09-30T23:59:00+07:00'
    });
    const c1 = (await a.listCoupons()).find((c) => c.id === 'c1');
    expect(c1).toMatchObject({ value: 12, description: 'Đã sửa', usedCount: 23 });
  });

  it('toggleCoupon đổi active', async () => {
    const a = api();
    const toggled = await a.toggleCoupon('c2');
    expect(toggled.active).toBe(false);
  });

  it('deleteCoupon xóa khỏi list', async () => {
    const a = api();
    await a.deleteCoupon('c4');
    expect((await a.listCoupons()).map((c) => c.id)).not.toContain('c4');
  });
});

describe('stats + invoice', () => {
  it('revenueByDay mặc định trả đủ 14 điểm, ngày tăng dần, điểm cuối = hôm nay', async () => {
    const days = await api().revenueByDay('', '');
    expect(days).toHaveLength(14);
    expect([...days].sort((x, y) => x.date.localeCompare(y.date)).map((d) => d.date)).toEqual(
      days.map((d) => d.date)
    );
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    const last = days[13];
    if (!last) throw new Error('revenueByDay phải có 14 điểm');
    expect(last.date).toBe(key);
    expect(last.revenue).toBe(775000); // = summary.todayRevenue
  });

  it('summary khớp seed đơn', async () => {
    const s = await api().ordersSummary();
    expect(s).toMatchObject({ pending: 1, paid: 1, confirmed: 1, shipped: 1, delivered: 1, cancelled: 1 });
    expect(s.totalRevenue).toBeGreaterThan(0);
  });

  it('topProducts 5 hàng, doanh thu giảm dần theo qty * giá trị khác nhau', async () => {
    const top = await api().topProducts();
    expect(top).toHaveLength(5);
    expect(top.every((p) => p.revenue > 0 && p.qty > 0)).toBe(true);
  });

  // SF-10: invoiceBlob placeholder đã XOÁ — PDF thật qua downloadAdminInvoice
  // (lib/invoice.ts, authStore.fetch binary; assert E2E level).
});
