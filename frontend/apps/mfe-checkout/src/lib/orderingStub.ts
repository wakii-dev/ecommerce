/**
 * orderingStub (SF-6) — ĐIỂM TẬP TRUNG DUY NHẤT giả lập ordering-service
 * (SF-9 chưa tồn tại). SF-10 wire live → thay FILE NÀY, không đụng UI.
 *
 * ĐÚNG shape contracts/openapi/ordering.yaml:
 *  - validateCoupon → ValidateCouponResponse (không reserve)
 *  - createOrder    → CreateOrderRequest (Idempotency-Key header) + mock Order
 *                     PENDING → clientSecret LẤY THẬT từ POST /api/payment/intents
 *                     (payment-service SF-5 live — "thanh toán thật, đơn mock")
 *  - confirmOrderMock → mock webhook: PENDING→PAID→CONFIRMED (thứ tự §3.6
 *                     ordering.yaml OrderStatus) sau khi Stripe confirm OK.
 *
 * Toggle: VITE_ORDERING_STUB !== '0' (mặc định ON — KHÔNG tắt trong commit).
 *
 * Pin spec-critic: line non-variant gửi variantId "" (contract CreateOrderItem
 * required cả variantId) — leniency stub, SF-9/SF-10 revisit cho non-variant.
 */

export const ORDERING_STUB = import.meta.env.VITE_ORDERING_STUB !== '0';

export type PaymentMethod = 'stripe' | 'cod';
export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export interface Address {
  fullName: string;
  phone: string;
  line1: string;
  ward: string;
  district: string;
  city: string;
}

export interface OrderLine {
  id: string;
  productId: string;
  variantId: string;
  name?: string;
  image?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  items: OrderLine[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: 'VND';
  couponCode?: string;
  /** SF-12 — attribution affiliate (ordering.yaml nullable; ledger hoa hồng). */
  affiliateCode?: string | null;
  paymentMethod: PaymentMethod;
  shippingMethod: string;
  address: Address;
  timeline: { status: OrderStatus; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ValidateCouponResponse {
  valid: boolean;
  discount: number;
  message?: string;
}

/** Mock coupon registry — seed khi chạy thật sẽ là WELCOME10 (SF-10). */
const COUPONS: Record<string, { type: 'PERCENT' | 'FIXED'; value: number }> = {
  WELCOME10: { type: 'PERCENT', value: 10 }
};

export function validateCoupon(code: string, subtotal: number): ValidateCouponResponse {
  const coupon = COUPONS[code.trim().toUpperCase()];
  if (!coupon) {
    return { valid: false, discount: 0, message: 'Mã không tồn tại hoặc đã hết hạn' };
  }
  // §6.1.3: % trên VND làm tròn XUỐNG (floor)
  const discount =
    coupon.type === 'PERCENT'
      ? Math.floor((subtotal * coupon.value) / 100)
      : Math.min(coupon.value, subtotal);
  return { valid: true, discount };
}

/** Payment-service trả 503 payment_unconfigured (không STRIPE_SECRET_KEY). */
export class PaymentUnavailableError extends Error {
  constructor() {
    super('payment_unconfigured — chưa cấu hình thanh toán (thiếu Stripe key)');
    this.name = 'PaymentUnavailableError';
  }
}

export interface CreateOrderInput {
  items: OrderLine[]; // CHỈ item khả dụng — caller lọc trước
  address: Address;
  shippingMethod: string;
  shippingFee: number;
  couponCode?: string;
  /** SF-12 — cookie aff_ref nếu đơn qua link affiliate. */
  affiliateCode?: string;
  userId: string;
}

export interface CreatedOrder {
  order: Order;
  /** null = mock panel (không key / payment degraded) — nút "Đặt hàng (demo)". */
  clientSecret: string | null;
}

function shortId(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `mock-${uuid.split('-')[0]}`;
}

/** POST /api/payment/intents THẬT (payment-service SF-5, VND zero-decimal). */
async function createPaymentIntent(orderId: string, amount: number, idempotencyKey: string): Promise<string> {
  const res = await fetch('/api/payment/intents', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, amount, currency: 'VND', idempotencyKey })
  });
  if (res.status === 503) {
    throw new PaymentUnavailableError();
  }
  const body = (await res.json().catch(() => null)) as
    | { clientSecret?: string; detail?: string }
    | null;
  if (!res.ok || !body?.clientSecret) {
    throw new PaymentUnavailableError();
  }
  return body.clientSecret;
}

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  if (input.items.length === 0) {
    throw new Error('Giỏ không có sản phẩm khả dụng để đặt hàng');
  }
  const subtotal = input.items.reduce((sum, line) => sum + line.lineTotal, 0);
  const coupon = input.couponCode ? validateCoupon(input.couponCode, subtotal) : null;
  const discount = coupon?.valid ? coupon.discount : 0;
  const total = subtotal - discount + input.shippingFee;

  const orderId = shortId();
  const now = new Date().toISOString();

  const order: Order = {
    id: orderId,
    userId: input.userId,
    status: 'PENDING',
    items: input.items,
    subtotal,
    discount,
    shippingFee: input.shippingFee,
    total,
    currency: 'VND',
    ...(input.couponCode ? { couponCode: input.couponCode.trim().toUpperCase() } : {}),
    affiliateCode: input.affiliateCode ?? null,
    paymentMethod: 'stripe',
    shippingMethod: input.shippingMethod,
    address: input.address,
    timeline: [{ status: 'PENDING', at: now }],
    createdAt: now,
    updatedAt: now
  };

  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `idem-${orderId}`;

  // 503 payment_unconfigured (không STRIPE_SECRET_KEY) → mock panel branch:
  // order VẪN được tạo (clientSecret null) — nút "Đặt hàng (demo)" finalize
  // được; KHÔNG throw ra ngoài (bug đã gặp: mockPanel hiện nhưng created null).
  try {
    const clientSecret = await createPaymentIntent(orderId, total, idempotencyKey);
    return { order, clientSecret };
  } catch (err) {
    if (err instanceof PaymentUnavailableError) {
      return { order, clientSecret: null };
    }
    throw err;
  }
}

/** Mock webhook Stripe succeeded — PENDING→PAID→CONFIRMED (đúng thứ tự §3.6).
 *  Chỉ gọi sau khi confirm THÀNH CÔNG (hoặc nhánh demo). */
export function confirmOrderMock(order: Order): Order {
  const now = new Date().toISOString();
  return {
    ...order,
    status: 'CONFIRMED',
    timeline: [
      ...order.timeline,
      { status: 'PAID', at: now },
      { status: 'CONFIRMED', at: now }
    ],
    updatedAt: now
  };
}
