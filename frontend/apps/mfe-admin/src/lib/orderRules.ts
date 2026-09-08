// lib/orderRules.ts — pure order state machine §3.6 (admin actions).
// SF-3 honesty-pass (FI-372 T6): tách khỏi adminStub — dữ liệu admin đã LIVE
// qua clients contracts (SF-10); chỉ luật chuyển trạng thái là logic thuần,
// test độc lập (tests/orderRules.test.ts), không phụ thuộc seed giả.

import type { OrderStatusValue } from './types';

// ── Order state machine §3.6 (admin actions — KHÔNG có confirm) ────────────
const CAN_SHIP: ReadonlySet<OrderStatusValue> = new Set(['PAID', 'CONFIRMED']);
const CAN_DELIVER: ReadonlySet<OrderStatusValue> = new Set(['SHIPPED']);
const CAN_CANCEL: ReadonlySet<OrderStatusValue> = new Set(['PENDING', 'PAID', 'CONFIRMED']);

export function canShip(status: OrderStatusValue): boolean {
  return CAN_SHIP.has(status);
}
export function canDeliver(status: OrderStatusValue): boolean {
  return CAN_DELIVER.has(status);
}
export function canCancel(status: OrderStatusValue): boolean {
  return CAN_CANCEL.has(status);
}
