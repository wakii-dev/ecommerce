// lib/adminStub.ts — mock adapters cho coupons/reviews/orders/stats (SF-7).
// Data DETERMINISTIC (ids/dates/totals cố định — giá trị theo ngày tuyệt đối
// 2026-09; riêng revenue-by-day neo vào "hôm nay" để dashboard chart hiển thị
// đẹp nhưng PATTERN giá trị vẫn hằng số). Mutations in-memory session — reload
// reset (mock sống tới SF-10 wire live).

import type {
  ModerationStatus,
  OrderStatusValue,
  StubCoupon,
  StubCouponInput,
  StubOrder,
  StubOrderEvent,
  StubRevenueDay,
  StubReview,
  StubSummary,
  StubTopProduct
} from './types';

export interface StubApiOptions {
  /** Delay giả lập network (ms) — test truyền 0. */
  delayMs?: number;
}

export interface StubApi {
  listCoupons(): Promise<StubCoupon[]>;
  createCoupon(input: StubCouponInput): Promise<StubCoupon>;
  updateCoupon(id: string, input: StubCouponInput): Promise<StubCoupon>;
  toggleCoupon(id: string): Promise<StubCoupon>;
  deleteCoupon(id: string): Promise<void>;

  listReviews(status?: ModerationStatus): Promise<StubReview[]>;
  approveReview(id: string): Promise<void>;
  rejectReview(id: string): Promise<void>;

  listOrders(): Promise<StubOrder[]>;
  getOrder(id: string): Promise<StubOrder | undefined>;
  shipOrder(id: string): Promise<StubOrder>;
  deliverOrder(id: string): Promise<StubOrder>;
  cancelOrder(id: string): Promise<StubOrder>;

  ordersSummary(): Promise<StubSummary>;
  revenueByDay(from: string, to: string): Promise<StubRevenueDay[]>;
  topProducts(): Promise<StubTopProduct[]>;
}

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

function transition(order: StubOrder, next: OrderStatusValue, description: string): StubOrder {
  if (order.status === next) return order; // idempotent retry
  const event: StubOrderEvent = { at: new Date().toISOString(), description };
  const updated: StubOrder = {
    ...order,
    status: next,
    timeline: [...order.timeline, event],
    updatedAt: event.at
  };
  Object.assign(order, updated);
  return order;
}

// ── Deterministic seed ─────────────────────────────────────────────────────
/** ISO instant từ ngày + giờ VN (dấu +07:00 cố định — deterministic tuyệt đối). */
function at(day: string, time: string): string {
  return new Date(`${day}T${time}:00+07:00`).toISOString();
}

/** yyyy-mm-dd của Date theo local (dùng cho revenue-by-day keys). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const COUPONS: StubCoupon[] = [
  {
    id: 'c1',
    code: 'WELCOME10',
    type: 'PERCENT',
    value: 10,
    minOrderValue: 200000,
    startsAt: at('2026-09-01', '00:00'),
    endsAt: at('2026-09-30', '23:59'),
    usageLimit: 100,
    usedCount: 23,
    active: true,
    description: 'Giảm 10% cho đơn đầu tiên'
  },
  {
    id: 'c2',
    code: 'FREESHIP50K',
    type: 'FIXED',
    value: 50000,
    startsAt: at('2026-09-02', '00:00'),
    endsAt: at('2026-09-16', '23:59'),
    usageLimit: 200,
    usedCount: 87,
    active: true,
    description: 'Miễn phí vận chuyển tới 50.000₫'
  },
  {
    id: 'c3',
    code: 'SALE500K',
    type: 'FIXED',
    value: 500000,
    minOrderValue: 5000000,
    startsAt: at('2026-08-20', '00:00'),
    endsAt: at('2026-09-03', '23:59'),
    usageLimit: 50,
    usedCount: 50,
    active: false,
    description: 'Giảm 500.000₫ cho đơn trên 5 triệu'
  },
  {
    id: 'c4',
    code: 'FLASH15',
    type: 'PERCENT',
    value: 15,
    minOrderValue: 1000000,
    startsAt: at('2026-09-05', '00:00'),
    endsAt: at('2026-09-07', '23:59'),
    usageLimit: 300,
    usedCount: 41,
    active: true,
    description: 'Flash sale 15%'
  }
];

const REVIEWS: StubReview[] = [
  {
    id: 'r1',
    productId: 'sp-ao-thun',
    userId: 'u-ngoc',
    userName: 'Nguyễn Ngọc',
    rating: 5,
    title: 'Áo đẹp, chất liệu mát',
    content: 'Áo nhận được đúng như hình, đường may chắc chắn, sẽ ủng hộ shop tiếp.',
    verifiedPurchase: true,
    status: 'PENDING',
    createdAt: at('2026-09-04', '10:12')
  },
  {
    id: 'r2',
    productId: 'sp-hoa-tuoi',
    userId: 'u-minh',
    userName: 'Trần Minh',
    rating: 4,
    content: 'Hoa tươi, giao nhanh. Hơi nhíu vì giấy gói.',
    verifiedPurchase: true,
    status: 'PENDING',
    createdAt: at('2026-09-05', '09:30')
  },
  {
    id: 'r3',
    productId: 'sp-tui-xach',
    userId: 'u-hang',
    userName: 'Lê Hằng',
    rating: 2,
    content: 'Túi nhỏ hơn hình nhiều, nên ghi rõ kích thước.',
    verifiedPurchase: true,
    status: 'PENDING',
    createdAt: at('2026-09-05', '14:05')
  },
  {
    id: 'r4',
    productId: 'sp-dong-ho',
    userId: 'u-quang',
    userName: 'Phạm Quang',
    rating: 1,
    content: 'Hàng trưng bày không như mô tả, yêu cầu xem xét.',
    verifiedPurchase: false,
    status: 'PENDING',
    createdAt: at('2026-09-06', '08:00')
  },
  {
    id: 'r5',
    productId: 'sp-ao-thun',
    userId: 'u-lan',
    userName: 'Đỗ Lan',
    rating: 5,
    title: 'Nên mua',
    content: 'Form ổn, giặt không ra màu.',
    verifiedPurchase: true,
    status: 'APPROVED',
    createdAt: at('2026-09-02', '11:00')
  }
];

/** Tên mock cho productId (hiển thị queue moderation — không gọi catalog). */
export const MOCK_PRODUCT_NAMES: Readonly<Record<string, string>> = {
  'sp-ao-thun': 'Áo thun locally sneaker trắng',
  'sp-hoa-tuoi': 'Hoa tươi sinh nhật 20 nhánh',
  'sp-tui-xach': 'Túi xách da nữ bán chạy',
  'sp-dong-ho': 'Đồng hồ thông minh Watch Fit 2',
  'sp-tai-nghe': 'Tai nghe không dây AirBuds'
};

function line(
  id: string,
  productId: string,
  name: string,
  qty: number,
  unitPrice: number,
  variantId = 'v-default'
) {
  return { id, productId, variantId, name, qty, unitPrice, lineTotal: qty * unitPrice };
}

const ORDERS: StubOrder[] = [
  {
    id: 'o-100231',
    userId: 'u-ngoc',
    status: 'PENDING',
    items: [line('l1', 'sp-ao-thun', 'Áo thun locally sneaker trắng', 2, 189000)],
    subtotal: 378000,
    discount: 0,
    shippingFee: 25000,
    total: 403000,
    paymentMethod: 'stripe',
    shippingMethod: 'flat',
    address: {
      fullName: 'Nguyễn Ngọc',
      phone: '0901234567',
      line1: '12 Nguyễn Huệ',
      ward: 'Bến Nghé',
      district: 'Quận 1',
      city: 'TP. Hồ Chí Minh'
    },
    timeline: [{ at: at('2026-09-01', '20:15'), description: 'Đơn đã được đặt' }],
    createdAt: at('2026-09-01', '20:15'),
    updatedAt: at('2026-09-01', '20:15')
  },
  {
    id: 'o-100232',
    userId: 'u-minh',
    status: 'PAID',
    items: [line('l2', 'sp-hoa-tuoi', 'Hoa tươi sinh nhật 20 nhánh', 1, 459000)],
    subtotal: 459000,
    discount: 45900,
    shippingFee: 25000,
    total: 438100,
    couponCode: 'WELCOME10',
    paymentMethod: 'stripe',
    shippingMethod: 'flat',
    address: {
      fullName: 'Trần Minh',
      phone: '0912345678',
      line1: '45 Lê Lợi',
      ward: 'Bến Nghé',
      district: 'Quận 1',
      city: 'TP. Hồ Chí Minh'
    },
    timeline: [
      { at: at('2026-09-02', '08:10'), description: 'Đơn đã được đặt' },
      { at: at('2026-09-02', '08:12'), description: 'Thanh toán thành công (Stripe)' }
    ],
    createdAt: at('2026-09-02', '08:10'),
    updatedAt: at('2026-09-02', '08:12')
  },
  {
    id: 'o-100233',
    userId: 'u-hang',
    status: 'CONFIRMED',
    items: [
      line('l3', 'sp-tui-xach', 'Túi xách da nữ bán chạy', 1, 1290000),
      line('l4', 'sp-tai-nghe', 'Tai nghe không dây AirBuds', 1, 750000)
    ],
    subtotal: 2040000,
    discount: 0,
    shippingFee: 0,
    total: 2040000,
    affiliateCode: 'aff-minh',
    paymentMethod: 'stripe',
    shippingMethod: 'flat',
    address: {
      fullName: 'Lê Hằng',
      phone: '0923456789',
      line1: '78 Trường Chinh',
      ward: 'Phương Liệt',
      district: 'Thanh Xuân',
      city: 'Hà Nội'
    },
    timeline: [
      { at: at('2026-09-03', '10:00'), description: 'Đơn đã được đặt' },
      { at: at('2026-09-03', '10:02'), description: 'Thanh toán thành công (Stripe)' },
      { at: at('2026-09-03', '10:05'), description: 'Đơn đã được xác nhận' }
    ],
    createdAt: at('2026-09-03', '10:00'),
    updatedAt: at('2026-09-03', '10:05')
  },
  {
    id: 'o-100234',
    userId: 'u-quang',
    status: 'SHIPPED',
    items: [line('l5', 'sp-dong-ho', 'Đồng hồ thông minh Watch Fit 2', 1, 2450000)],
    subtotal: 2450000,
    discount: 245000,
    shippingFee: 25000,
    total: 2230000,
    couponCode: 'FLASH15',
    paymentMethod: 'cod',
    shippingMethod: 'flat',
    address: {
      fullName: 'Phạm Quang',
      phone: '0934567890',
      line1: '9 Nguyễn Trãi',
      ward: 'P. Ben Nghe',
      district: 'Quận 1',
      city: 'TP. Hồ Chí Minh'
    },
    timeline: [
      { at: at('2026-09-04', '09:00'), description: 'Đơn đã được đặt' },
      { at: at('2026-09-04', '09:03'), description: 'Đơn đã được xác nhận (COD)' },
      { at: at('2026-09-04', '16:40'), description: 'Đã giao cho đơn vị vận chuyển' }
    ],
    createdAt: at('2026-09-04', '09:00'),
    updatedAt: at('2026-09-04', '16:40')
  },
  {
    id: 'o-100235',
    userId: 'u-lan',
    status: 'DELIVERED',
    items: [line('l6', 'sp-ao-thun', 'Áo thun locally sneaker trắng', 3, 189000)],
    subtotal: 567000,
    discount: 56700,
    shippingFee: 25000,
    total: 535300,
    couponCode: 'WELCOME10',
    paymentMethod: 'stripe',
    shippingMethod: 'flat',
    address: {
      fullName: 'Đỗ Lan',
      phone: '0945678901',
      line1: '120 Hoàng Quốc Việt',
      ward: 'Nghĩa Đô',
      district: 'Cầu Giấy',
      city: 'Hà Nội'
    },
    timeline: [
      { at: at('2026-09-05', '07:30'), description: 'Đơn đã được đặt' },
      { at: at('2026-09-05', '07:33'), description: 'Thanh toán thành công (Stripe)' },
      { at: at('2026-09-05', '07:35'), description: 'Đơn đã được xác nhận' },
      { at: at('2026-09-05', '13:00'), description: 'Đã giao cho đơn vị vận chuyển' },
      { at: at('2026-09-05', '19:45'), description: 'Giao hàng thành công' }
    ],
    createdAt: at('2026-09-05', '07:30'),
    updatedAt: at('2026-09-05', '19:45')
  },
  {
    id: 'o-100236',
    userId: 'u-minh',
    status: 'CANCELLED',
    items: [line('l7', 'sp-tai-nghe', 'Tai nghe không dây AirBuds', 1, 750000)],
    subtotal: 750000,
    discount: 0,
    shippingFee: 25000,
    total: 775000,
    paymentMethod: 'stripe',
    shippingMethod: 'flat',
    address: {
      fullName: 'Trần Minh',
      phone: '0912345678',
      line1: '45 Lê Lợi',
      ward: 'Bến Nghé',
      district: 'Quận 1',
      city: 'TP. Hồ Chí Minh'
    },
    timeline: [
      { at: at('2026-09-06', '06:00'), description: 'Đơn đã được đặt' },
      { at: at('2026-09-06', '06:01'), description: 'Thanh toán thành công (Stripe)' },
      { at: at('2026-09-06', '06:20'), description: 'Đơn đã bị hủy (admin)' }
    ],
    createdAt: at('2026-09-06', '06:00'),
    updatedAt: at('2026-09-06', '06:20')
  }
];

/** Mirror OrdersSummary — khớp ORDERS seed (đơn PAID+ = doanh thu). */
const SUMMARY: StubSummary = {
  pending: 1,
  paid: 1,
  confirmed: 1,
  shipped: 1,
  delivered: 1,
  cancelled: 1,
  failed: 0,
  totalRevenue: 4983400,
  todayRevenue: 775000,
  todayOrders: 2
};

/**
 * Pattern doanh thu 14 ngày HẰNG SỐ (index 0 = 13 ngày trước … 13 = hôm nay).
 * Revenue-by-day neo vào today để chart hiển thị, giá trị vẫn deterministic.
 */
const REVENUE_PATTERN: ReadonlyArray<{ revenue: number; orders: number }> = [
  { revenue: 1200000, orders: 3 },
  { revenue: 2450000, orders: 5 },
  { revenue: 980000, orders: 2 },
  { revenue: 3100000, orders: 7 },
  { revenue: 1750000, orders: 4 },
  { revenue: 2680000, orders: 6 },
  { revenue: 2210000, orders: 5 },
  { revenue: 1590000, orders: 4 },
  { revenue: 3340000, orders: 8 },
  { revenue: 2050000, orders: 5 },
  { revenue: 2870000, orders: 6 },
  { revenue: 1930000, orders: 4 },
  { revenue: 4120000, orders: 9 },
  { revenue: 775000, orders: 2 }
];

const TOP_PRODUCTS: StubTopProduct[] = [
  { productId: 'sp-ao-thun', name: 'Áo thun locally sneaker trắng', qty: 128, revenue: 24192000 },
  { productId: 'sp-dong-ho', name: 'Đồng hồ thông minh Watch Fit 2', qty: 64, revenue: 156800000 },
  { productId: 'sp-tai-nghe', name: 'Tai nghe không dây AirBuds', qty: 96, revenue: 72000000 },
  { productId: 'sp-tui-xach', name: 'Túi xách da nữ bán chạy', qty: 37, revenue: 47730000 },
  { productId: 'sp-hoa-tuoi', name: 'Hoa tươi sinh nhật 20 nhánh', qty: 51, revenue: 23409000 }
];

/** Tạo StubApi MỚI (state in-memory riêng) — 2 instance độc lập, seed như nhau. */
export function createStubApi({ delayMs = 120 }: StubApiOptions = {}): StubApi {
  const coupons: StubCoupon[] = COUPONS.map((c) => ({ ...c }));
  const reviews: StubReview[] = REVIEWS.map((r) => ({ ...r }));
  const orders: StubOrder[] = ORDERS.map((o) => ({
    ...o,
    items: o.items.map((l) => ({ ...l })),
    address: { ...o.address },
    timeline: o.timeline.map((e) => ({ ...e }))
  }));
  const wait = (): Promise<void> => (delayMs > 0 ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const findOrder = (id: string): StubOrder => {
    const found = orders.find((o) => o.id === id);
    if (!found) throw new Error(`ORDER_NOT_FOUND:${id}`);
    return found;
  };

  return {
    async listCoupons() {
      await wait();
      return clone(coupons);
    },
    async createCoupon(input) {
      await wait();
      const created: StubCoupon = { ...input, id: `c${coupons.length + 1}-${Date.now()}`, usedCount: 0 };
      coupons.unshift(created);
      return clone(created);
    },
    async updateCoupon(id, input) {
      await wait();
      const idx = coupons.findIndex((c) => c.id === id);
      if (idx < 0) throw new Error(`COUPON_NOT_FOUND:${id}`);
      const existing = coupons[idx];
      if (!existing) throw new Error(`COUPON_NOT_FOUND:${id}`);
      coupons[idx] = { ...input, id, usedCount: existing.usedCount };
      return clone(coupons[idx]);
    },
    async toggleCoupon(id) {
      await wait();
      const found = coupons.find((c) => c.id === id);
      if (!found) throw new Error(`COUPON_NOT_FOUND:${id}`);
      found.active = !found.active;
      return clone(found);
    },
    async deleteCoupon(id) {
      await wait();
      const idx = coupons.findIndex((c) => c.id === id);
      if (idx >= 0) coupons.splice(idx, 1);
    },

    async listReviews(status) {
      await wait();
      const list = status ? reviews.filter((r) => r.status === status) : reviews;
      return clone(list);
    },
    async approveReview(id) {
      await wait();
      const found = reviews.find((r) => r.id === id);
      if (!found) throw new Error(`REVIEW_NOT_FOUND:${id}`);
      found.status = 'APPROVED';
    },
    async rejectReview(id) {
      await wait();
      const found = reviews.find((r) => r.id === id);
      if (!found) throw new Error(`REVIEW_NOT_FOUND:${id}`);
      found.status = 'REJECTED';
    },

    async listOrders() {
      await wait();
      return clone(orders);
    },
    async getOrder(id) {
      await wait();
      const found = orders.find((o) => o.id === id);
      return found ? clone(found) : undefined;
    },
    async shipOrder(id) {
      await wait();
      const order = findOrder(id);
      if (!canShip(order.status)) throw new Error('INVALID_TRANSITION');
      return clone(transition(order, 'SHIPPED', 'Đã giao cho đơn vị vận chuyển'));
    },
    async deliverOrder(id) {
      await wait();
      const order = findOrder(id);
      if (!canDeliver(order.status)) throw new Error('INVALID_TRANSITION');
      return clone(transition(order, 'DELIVERED', 'Giao hàng thành công'));
    },
    async cancelOrder(id) {
      await wait();
      const order = findOrder(id);
      if (!canCancel(order.status)) throw new Error('INVALID_TRANSITION');
      return clone(transition(order, 'CANCELLED', 'Đơn đã bị hủy (admin)'));
    },

    async ordersSummary() {
      await wait();
      return clone(SUMMARY);
    },
    async revenueByDay(from, to) {
      await wait();
      const today = new Date();
      const days: StubRevenueDay[] = REVENUE_PATTERN.map((p, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (REVENUE_PATTERN.length - 1 - i));
        return { date: dayKey(d), revenue: p.revenue, orders: p.orders };
      });
      return days.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
    },
    async topProducts() {
      await wait();
      return clone(TOP_PRODUCTS);
    }
  };
}
