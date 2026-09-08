import { describe, expect, it } from 'vitest';

import * as orderRules from '../src/lib/orderRules';
import { canCancel, canDeliver, canShip } from '../src/lib/orderRules';

/**
 * SF-3 honesty-pass (FI-372 T6): order rules tách khỏi adminStub — truth
 * table §3.6 thuần tuý trên 7 trạng thái, không seed dữ liệu giả.
 * Invariant: KHÔNG có action confirm — PENDING→PAID do webhook/payment lo,
 * admin không tự xác nhận đơn giúp user.
 */
describe('order state machine §3.6 (admin actions)', () => {
  it('ship chỉ từ PAID/CONFIRMED', () => {
    expect(canShip('PAID')).toBe(true);
    expect(canShip('CONFIRMED')).toBe(true);
    expect(canShip('PENDING')).toBe(false);
    expect(canShip('SHIPPED')).toBe(false);
    expect(canShip('DELIVERED')).toBe(false);
    expect(canShip('CANCELLED')).toBe(false);
    expect(canShip('FAILED')).toBe(false);
  });

  it('deliver chỉ từ SHIPPED', () => {
    expect(canDeliver('SHIPPED')).toBe(true);
    expect(canDeliver('PENDING')).toBe(false);
    expect(canDeliver('PAID')).toBe(false);
    expect(canDeliver('CONFIRMED')).toBe(false);
    expect(canDeliver('DELIVERED')).toBe(false);
    expect(canDeliver('CANCELLED')).toBe(false);
    expect(canDeliver('FAILED')).toBe(false);
  });

  it('cancel từ PENDING/PAID/CONFIRMED — không từ SHIPPED/DELIVERED/FAILED', () => {
    expect(canCancel('PENDING')).toBe(true);
    expect(canCancel('PAID')).toBe(true);
    expect(canCancel('CONFIRMED')).toBe(true);
    expect(canCancel('SHIPPED')).toBe(false);
    expect(canCancel('DELIVERED')).toBe(false);
    expect(canCancel('CANCELLED')).toBe(false);
    expect(canCancel('FAILED')).toBe(false);
  });

  it('module surface đúng 3 rules — không có action confirm nào lẻn vào', () => {
    expect(Object.keys(orderRules).sort()).toEqual(['canCancel', 'canDeliver', 'canShip']);
  });
});
