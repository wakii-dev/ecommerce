// Re-export types events (generated từ contracts/events/*.schema.json — envelope tự chứa).
// Quy tắc additive-only: chỉ thêm field optional — xem contracts/events/README.md.
export type { Envelope } from './generated/events/envelope';
export type { UserCreated } from './generated/events/user.created';
export type { ProductChanged } from './generated/events/product.changed';
export type { InventoryReserved } from './generated/events/inventory.reserved';
export type { InventoryReleased } from './generated/events/inventory.released';
export type { InventoryCommitted } from './generated/events/inventory.committed';
export type { PaymentSucceeded } from './generated/events/payment.succeeded';
export type { PaymentFailed } from './generated/events/payment.failed';
export type { OrderCreated } from './generated/events/order.created';
export type { OrderPaid } from './generated/events/order.paid';
export type { OrderConfirmed } from './generated/events/order.confirmed';
export type { OrderCancelled } from './generated/events/order.cancelled';
export type { OrderFailed } from './generated/events/order.failed';
export type { ReviewModerated } from './generated/events/review.moderated';
