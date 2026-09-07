/**
 * orderingApi (SF-10) — wire THẬT thay orderingStub (SF-6): mọi gọi đi qua
 * createOrderingClient (@ecommerce/contracts) same-origin gateway, kèm
 * authStore.fetch (401 tự refresh + retry, pattern ordersApi SF-9).
 *
 * ĐÚNG shape contracts/openapi/ordering.yaml:
 *  - createOrder    → POST /api/ordering/orders (Idempotency-Key BẮT BUỘC)
 *                     201 → CreateOrderResponse {order, clientSecret}
 *                     502 → saga đã compensation (đơn FAILED, stock + coupon
 *                     released) — ApiErrorClient ném ra cho UI hiện lý do.
 *  - validateCoupon → POST /api/ordering/orders/validate-coupon (public,
 *                     không reserve — realtime FE).
 *  - fetchMyOrder   → GET /api/ordering/me/orders/{id} — ConfirmationPage
 *                     poll tới trạng thái terminal (webhook Stripe → PAID →
 *                     CONFIRMED mất vài giây).
 *
 * Pin spec-critic (SF-6 giữ nguyên): item non-variant gửi variantId ""
 * (contract CreateOrderItem required cả variantId).
 */
import { authStore } from '@ecommerce/auth';
import {
  ApiErrorClient,
  createOrderingClient,
  type ApiClientOptions,
  type OrderingClient
} from '@ecommerce/contracts';

export { ApiErrorClient };

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

/** Mirror runtime JSON của ordering.yaml Order (packages/contracts chỉ export clients). */
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
  couponCode?: string | null;
  affiliateCode?: string | null;
  paymentMethod: PaymentMethod;
  shippingMethod: string;
  trackingCode?: string | null;
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

export interface CreateOrderInput {
  items: OrderLine[]; // CHỈ item khả dụng — caller lọc trước
  address: Address;
  shippingMethod: string;
  couponCode?: string;
  /** SF-12 — cookie aff_ref nếu đơn qua link affiliate. */
  affiliateCode?: string;
}

export interface CreatedOrder {
  order: Order;
  /** Stripe clientSecret (null khi COD — D21; stripe flow luôn có khi 201). */
  clientSecret: string | null;
}

function clientOptions(): ApiClientOptions {
  return {
    // Same-origin qua gateway (shell/vite proxy /api → :8080; profile full cùng origin)
    baseURL: '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

// KHÔNG cache client — authStore.fetch thay sau configureAuth (pattern api.ts SF-3)
function client(): OrderingClient {
  return createOrderingClient(clientOptions());
}

function uuid(): string {
  try {
    const c = globalThis as { crypto?: { randomUUID?: () => string } };
    if (typeof c.crypto?.randomUUID === 'function') return c.crypto.randomUUID();
  } catch {
    // không có crypto — fallback dưới
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** POST /orders thật. 502 (payment/catalog/inventory hỏng — saga đã hủy đơn +
 *  release) → ApiErrorClient cho UI hiện lý do; KHÔNG còn nhánh mock. */
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  if (input.items.length === 0) {
    throw new ApiErrorClient(
      { title: 'Bad Request', status: 400, detail: 'Giỏ không có sản phẩm khả dụng để đặt hàng' },
      400,
      'Bad Request'
    );
  }
  return (await client().createOrder({
    'Idempotency-Key': uuid(),
    items: input.items.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      qty: line.qty
    })),
    paymentMethod: 'stripe',
    shippingMethod: input.shippingMethod,
    address: input.address,
    ...(input.couponCode?.trim() ? { couponCode: input.couponCode.trim().toUpperCase() } : {}),
    ...(input.affiliateCode ? { affiliateCode: input.affiliateCode } : {})
  })) as CreatedOrder;
}

/** POST /orders/validate-coupon (public, không reserve) — realtime FE.
 *  Uppercase giữ UX stub (server chỉ trim — DB lưu code hoa). */
export async function validateCoupon(code: string, subtotal: number): Promise<ValidateCouponResponse> {
  return (await client().validateCoupon({
    code: code.trim().toUpperCase(),
    subtotal
  })) as ValidateCouponResponse;
}

/** GET /me/orders/{id} — ConfirmationPage poll tới terminal state. */
export async function fetchMyOrder(id: string): Promise<Order> {
  return (await client().getMyOrder({ id })) as Order;
}
