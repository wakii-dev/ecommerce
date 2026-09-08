// lib/types.ts — shapes DTO admin-facing (đổi tên từ Stub* ở SF-3 honesty-pass
// FI-372: dữ liệu đã LIVE qua clients contracts từ SF-10 — tên "Stub" nói dối
// nguồn dữ liệu; shape bám chặt contract giữ nguyên):
// - Review: ReviewAdmin (catalog.yaml) — UGC không i18n (D17).
// - Order: Order/OrderSummary/Address/Timeline (ordering.yaml §3.6).
// - Summary/RevenueDay/TopProduct: mirror (ordering.yaml).

export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminReview {
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

export interface AdminOrderLine {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AdminAddress {
  fullName: string;
  phone: string;
  line1: string;
  ward: string;
  district: string;
  city: string;
  postalCode?: string;
}

/** SF-10: timeline contract (ordering.yaml) = {status, at} — KHÔNG description. */
export interface AdminOrderEvent {
  status: OrderStatusValue;
  at: string;
  description?: string;
}

export interface AdminOrder {
  id: string;
  userId: string;
  status: OrderStatusValue;
  items: AdminOrderLine[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  couponCode?: string;
  affiliateCode?: string;
  paymentMethod: 'stripe' | 'cod';
  shippingMethod: string;
  address: AdminAddress;
  timeline: AdminOrderEvent[];
  createdAt: string;
  updatedAt: string;
}

/** Mirror OrdersSummary (ordering.yaml). */
export interface AdminSummary {
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
export interface AdminRevenueDay {
  date: string;
  revenue: number;
  orders: number;
}

/** Mirror TopProduct (ordering.yaml). */
export interface AdminTopProduct {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}
