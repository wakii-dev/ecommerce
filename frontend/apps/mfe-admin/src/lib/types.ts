// lib/types.ts — shapes cho domain MOCK (SF-7). Bám chặt contract:
// - Coupon: PublicCoupon (ordering.yaml — KHÔNG có coupon admin CRUD, GAP
//   chấp nhận theo pack) + usageLimit/usedCount/active nội bộ.
// - Review: ReviewAdmin (catalog.yaml) — UGC không i18n (D17).
// - Order: Order/OrderSummary/Address/Timeline (ordering.yaml §3.6).
// SF-10 wire live thay stub bằng orderingApi — shape giữ nguyên khả dĩ.

export type CouponType = 'PERCENT' | 'FIXED';

export interface StubCoupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderValue?: number;
  startsAt?: string;
  endsAt?: string;
  usageLimit: number;
  usedCount: number;
  active: boolean;
  description: string;
}

/** Payload create/edit coupon (form → stub; id/usedCount do store quản). */
export type StubCouponInput = Omit<StubCoupon, 'id' | 'usedCount'>;

export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface StubReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  title?: string;
  content: string;
  verifiedPurchase: boolean;
  status: ModerationStatus;
  createdAt: string;
}

export type OrderStatusValue =
  | 'PENDING'
  | 'PAID'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export interface StubOrderLine {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface StubAddress {
  fullName: string;
  phone: string;
  line1: string;
  ward: string;
  district: string;
  city: string;
  postalCode?: string;
}

export interface StubOrderEvent {
  at: string;
  description: string;
}

export interface StubOrder {
  id: string;
  userId: string;
  status: OrderStatusValue;
  items: StubOrderLine[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  couponCode?: string;
  affiliateCode?: string;
  paymentMethod: 'stripe' | 'cod';
  shippingMethod: string;
  address: StubAddress;
  timeline: StubOrderEvent[];
  createdAt: string;
  updatedAt: string;
}

/** Mirror OrdersSummary (ordering.yaml). */
export interface StubSummary {
  pending: number;
  paid: number;
  confirmed: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  failed: number;
  totalRevenue: number;
  todayRevenue: number;
  todayOrders: number;
}

/** Mirror RevenueByDay (ordering.yaml). */
export interface StubRevenueDay {
  date: string;
  revenue: number;
  orders: number;
}

/** Mirror TopProduct (ordering.yaml). */
export interface StubTopProduct {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}
