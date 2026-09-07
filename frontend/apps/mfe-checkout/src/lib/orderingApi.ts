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

// ── SF-14 (FI-324, D22): shipping methods + loyalty points ─────────────────

export interface ShippingMethod {
  id: string;
  name: string;
  fee: number;
  etaDays: number;
}

export interface LoyaltyAccount {
  userId: string;
  balance: number;
  totalEarned: number;
}

/** 1 điểm = 100đ — MIRROR affiliate.loyalty.point-vnd (spec D3). */
export const POINT_VND = 100;

export interface CreateOrderInput {
  items: OrderLine[]; // CHỈ item khả dụng — caller lọc trước
  address: Address;
  shippingMethod: string;
  /** SF-13 (D21) — 'stripe' | 'cod' (default stripe); COD → clientSecret null. */
  paymentMethod?: PaymentMethod;
  couponCode?: string;
  /** SF-12 — cookie aff_ref nếu đơn qua link affiliate. */
  affiliateCode?: string;
  /** SF-14 (D22) — số điểm muốn dùng (server cap theo subtotal - coupon). */
  usePoints?: number;
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
    paymentMethod: input.paymentMethod ?? 'stripe',
    shippingMethod: input.shippingMethod,
    address: input.address,
    ...(input.couponCode?.trim() ? { couponCode: input.couponCode.trim().toUpperCase() } : {}),
    ...(input.affiliateCode ? { affiliateCode: input.affiliateCode } : {}),
    ...(input.usePoints && input.usePoints > 0 ? { usePoints: input.usePoints } : {})
  })) as CreatedOrder;
}

/**
 * GET /shipping/methods?province&district — SF-14: methods GHN phí thật khi
 * có token + district là mã GHN, không thì flat-fee (degraded cùng shape).
 */
export async function fetchShippingMethods(
  province?: string,
  district?: string
): Promise<ShippingMethod[]> {
  return (await client().listShippingMethods({
    ...(province ? { province } : {}),
    ...(district ? { district } : {})
  })) as ShippingMethod[];
}

/**
 * GET /api/affiliate/me/loyalty — endpoint ADDITIVE của affiliate-service
 * (precedent suspend/reactivate SF-12): gọi qua fetch thủ công với
 * authStore.fetch (401 tự refresh), KHÔNG sửa packages/contracts.
 * Lỗi (affiliate chết…) → null — checkout vẫn chạy không điểm (degraded).
 */
export async function fetchLoyaltyBalance(): Promise<LoyaltyAccount | null> {
  try {
    const res = await authStore.fetch('/api/affiliate/me/loyalty');
    if (!res.ok) return null;
    return (await res.json()) as LoyaltyAccount;
  } catch {
    return null;
  }
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
