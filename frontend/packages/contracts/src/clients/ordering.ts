import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/orderingSchema';

const routes = {
  createOrder: ['POST', '/api/ordering/orders', ['Idempotency-Key']],
  validateCoupon: ['POST', '/api/ordering/orders/validate-coupon'],
  listPublicCoupons: ['GET', '/api/ordering/coupons/public'],
  listAdminCoupons: ['GET', '/api/ordering/admin/coupons'],
  createAdminCoupon: ['POST', '/api/ordering/admin/coupons'],
  updateAdminCoupon: ['PUT', '/api/ordering/admin/coupons/{code}'],
  deleteAdminCoupon: ['DELETE', '/api/ordering/admin/coupons/{code}'],
  toggleAdminCoupon: ['POST', '/api/ordering/admin/coupons/{code}/toggle'],
  listMyOrders: ['GET', '/api/ordering/me/orders'],
  getMyOrder: ['GET', '/api/ordering/me/orders/{id}'],
  cancelMyOrder: ['POST', '/api/ordering/me/orders/{id}/cancel'],
  getMyOrderInvoice: ['GET', '/api/ordering/me/orders/{id}/invoice'],
  getMyOrderTracking: ['GET', '/api/ordering/me/orders/{id}/tracking'],
  createRma: ['POST', '/api/ordering/me/rma'],
  listMyRmas: ['GET', '/api/ordering/me/rma'],
  listShippingMethods: ['GET', '/api/ordering/shipping/methods'],
  adminListOrders: ['GET', '/api/ordering/admin/orders'],
  adminGetOrder: ['GET', '/api/ordering/admin/orders/{id}'],
  adminShipOrder: ['POST', '/api/ordering/admin/orders/{id}/ship'],
  adminDeliverOrder: ['POST', '/api/ordering/admin/orders/{id}/deliver'],
  adminCancelOrder: ['POST', '/api/ordering/admin/orders/{id}/cancel'],
  adminGetOrderInvoice: ['GET', '/api/ordering/admin/orders/{id}/invoice'],
  adminListRmas: ['GET', '/api/ordering/admin/rma'],
  adminApproveRma: ['POST', '/api/ordering/admin/rma/{id}/approve'],
  adminRejectRma: ['POST', '/api/ordering/admin/rma/{id}/reject'],
  adminMarkRmaReceived: ['POST', '/api/ordering/admin/rma/{id}/mark-received'],
  adminRefundRma: ['POST', '/api/ordering/admin/rma/{id}/refund'],
  adminRevenueByDay: ['GET', '/api/ordering/admin/stats/revenue-by-day'],
  adminOrdersSummary: ['GET', '/api/ordering/admin/stats/orders-summary'],
  adminTopProducts: ['GET', '/api/ordering/admin/stats/top-products'],
} as const satisfies RouteMap;

export type OrderingClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createOrderingClient(opts: ApiClientOptions): OrderingClient {
  return createServiceClient<OrderingClient>(opts, routes);
}
