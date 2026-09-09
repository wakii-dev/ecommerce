// pages/orders/ordersApi.ts — slice SF-9 (CHỈ files pages/orders/* sở hữu).
// Client dựng từ @ecommerce/contracts (createOrderingClient) + authStore
// (fetchImpl = authStore.fetch → 401 tự refresh + retry, pattern api.ts SF-3).
// Types mirror runtime JSON của contracts/openapi/ordering.yaml — packages/contracts
// chỉ export clients (không export schema types) nên type tối thiểu đặt tại đây.
import { authStore } from '@ecommerce/auth';
import { createOrderingClient, type ApiClientOptions, type OrderingClient } from '@ecommerce/contracts';

export type OrderStatus = 'PENDING' | 'PAID' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'FAILED';

export interface OrderLine {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface TimelineEntry {
  status: OrderStatus;
  at: string;
}

export interface OrderAddress {
  fullName: string;
  phone: string;
  line1: string;
  ward: string;
  district: string;
  city: string;
  postalCode?: string | null;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  items: OrderLine[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  /** SF-14 (D22) — số tiền giảm từ điểm thưởng (contract Order.pointsDiscount). */
  pointsDiscount?: number | null;
  total: number;
  currency: 'VND';
  couponCode?: string | null;
  affiliateCode?: string | null;
  paymentMethod: 'stripe' | 'cod';
  shippingMethod: string;
  trackingCode?: string | null;
  address: OrderAddress;
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  itemsCount: number;
  total: number;
  currency: 'VND';
  paymentMethod: 'stripe' | 'cod';
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummaryPage {
  items: OrderSummary[];
  page: number;
  size: number;
  total: number;
}

function clientOptions(): ApiClientOptions {
  return {
    // Same-origin qua gateway (shell serve /api/** → :8080; standalone dev có vite proxy)
    baseURL: '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

// KHÔNG cache client — authStore.fetch thay sau configureAuth (pattern api.ts SF-3)
function client(): OrderingClient {
  return createOrderingClient(clientOptions());
}

/** Danh sách đơn của tôi (mới nhất trước, page 1-based). */
export async function fetchMyOrders(page = 1, size = 20): Promise<OrderSummaryPage> {
  return (await client().listMyOrders({ page, size })) as OrderSummaryPage;
}

/** Chi tiết đơn — chủ đơn only; của người khác service trả 404. */
export async function fetchMyOrder(id: string): Promise<Order> {
  return (await client().getMyOrder({ id })) as Order;
}

/** Hủy đơn PENDING → đơn CANCELLED. */
export async function cancelMyOrder(id: string): Promise<Order> {
  return (await client().cancelMyOrder({ id })) as Order;
}

// ── SF-14 (FI-324, D22): tracking + RMA ────────────────────────────────────

export interface TrackingEvent {
  at: string;
  description: string;
}

export interface TrackingResponse {
  trackingCode: string;
  carrier: string;
  status: string;
  events?: TrackingEvent[];
}

export interface RmaLine {
  lineId: string;
  qty: number;
}

export interface Rma {
  id: string;
  orderId: string;
  status: 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'REFUNDED' | 'REJECTED';
  lines: RmaLine[];
  reason: string;
  refundAmount?: number | null;
  createdAt: string;
}

/** GET /me/orders/{id}/tracking — GHN detail hoặc flat fallback (D22). */
export async function fetchOrderTracking(id: string): Promise<TrackingResponse> {
  return (await client().getMyOrderTracking({ id })) as TrackingResponse;
}

/** POST /me/rma — 202 REQUESTED; lỗi 409/400 → ApiErrorClient cho UI hiện lý do. */
export async function createRma(orderId: string, lines: RmaLine[], reason: string): Promise<Rma> {
  return (await client().createRma({ orderId, lines, reason })) as Rma;
}

/** GET /me/rma — danh sách RMA của tôi (lọc theo đơn ở caller). */
export async function fetchMyRmas(page = 1, size = 20): Promise<{ items: Rma[]; total: number }> {
  return (await client().listMyRmas({ page, size })) as { items: Rma[]; total: number };
}

/**
 * Tải hóa đơn PDF (D18) — binary nên không đi qua JSON client; fetch blob
 * qua authStore.fetch (giữ Authorization + tự refresh khi 401).
 * Lưu file với tên invoice-<id>.pdf.
 */
export async function downloadInvoicePdf(order: Order): Promise<void> {
  const res = await authStore.fetch(`/api/ordering/me/orders/${order.id}/invoice`);
  if (!res.ok) {
    let detail = `Tải hóa đơn lỗi (HTTP ${res.status})`;
    try {
      const problem = (await res.json()) as { detail?: string };
      if (problem.detail) detail = problem.detail;
    } catch {
      // body không phải json — giữ detail mặc định
    }
    // FI-394 verifier P1-2: message hard-code vi giữ làm fallback; caller key
    // hóa banner bằng name 'InvoiceDownloadError' + status (không import contracts).
    const err = new Error(detail);
    err.name = 'InvoiceDownloadError';
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${order.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
