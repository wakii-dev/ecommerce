// SF-4 (FI-394 T6) — OrderDetailPage: items Table rows + pill trong head,
// RMA modal (Textarea label + QuantityStepper max clamp 0..item.qty),
// cancel modal Escape đóng (useOverlay document keydown), tracking-block +
// timeline dot class (event primary / mốc terminal success). Mock ordersApi +
// bootstrap (globals:false → cleanup afterEach — pattern ordersPage.test.tsx).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import OrderDetailPage from '../pages/orders/OrderDetailPage';
import { appNavigate } from '../bootstrap';
import {
  cancelMyOrder,
  createRma,
  fetchMyOrder,
  fetchMyRmas,
  fetchOrderTracking,
  type Order,
  type Rma
} from '../pages/orders/ordersApi';

vi.mock('../bootstrap', () => ({
  appNavigate: vi.fn(),
  authReady: Promise.resolve(true)
}));

vi.mock('@ecommerce/auth', () => ({
  authStore: { isAuthenticated: vi.fn(() => true) }
}));

// OrdersPage được import (StatusBadge/formatVnd/formatDateTime) → fetchMyOrders
// phải có trong factory; downloadInvoicePdf do OrderDetailPage import trực tiếp.
vi.mock('../pages/orders/ordersApi', () => ({
  fetchMyOrders: vi.fn(),
  fetchMyOrder: vi.fn(),
  fetchMyRmas: vi.fn(),
  fetchOrderTracking: vi.fn(),
  cancelMyOrder: vi.fn(),
  createRma: vi.fn(),
  downloadInvoicePdf: vi.fn()
}));

function orderFixture(overrides: Partial<Order> = {}): Order {
  return {
    id: 'a1b2c3d4e5f6g7h8',
    userId: 'u1',
    status: 'DELIVERED',
    items: [
      { id: 'line-1', productId: 'p1', variantId: 'v1', name: 'Áo thun cotton', qty: 2, unitPrice: 150000, lineTotal: 300000 },
      { id: 'line-2', productId: 'p2', variantId: 'v2', name: 'Quần jeans', qty: 1, unitPrice: 450000, lineTotal: 450000 }
    ],
    subtotal: 750000,
    discount: 0,
    shippingFee: 25000,
    pointsDiscount: null,
    total: 775000,
    currency: 'VND',
    couponCode: null,
    affiliateCode: null,
    paymentMethod: 'stripe',
    shippingMethod: 'standard',
    trackingCode: 'GHN123VN',
    address: {
      fullName: 'Nguyen Van A',
      phone: '0901234567',
      line1: '12 Nguyễn Huệ',
      ward: 'Bến Nghé',
      district: 'Quận 1',
      city: 'TP.HCM',
      postalCode: null
    },
    timeline: [
      { status: 'PENDING', at: '2026-09-01T10:00:00Z' },
      { status: 'CONFIRMED', at: '2026-09-01T11:00:00Z' },
      { status: 'DELIVERED', at: '2026-09-03T09:00:00Z' }
    ],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-03T09:00:00Z',
    ...overrides
  };
}

const EMPTY_RMA_PAGE: { items: Rma[]; total: number } = { items: [], total: 0 };

const TRACKING = {
  trackingCode: 'GHN123VN',
  carrier: 'GHN',
  status: 'delivered',
  events: [
    { at: '2026-09-02 08:00', description: 'Đơn hàng đã được tạo' },
    { at: '2026-09-03 09:00', description: 'Giao hàng thành công' }
  ]
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(fetchMyOrder).mockReset();
  vi.mocked(fetchMyRmas).mockReset();
  vi.mocked(fetchOrderTracking).mockReset();
  vi.mocked(cancelMyOrder).mockReset();
  vi.mocked(createRma).mockReset();
  vi.mocked(appNavigate).mockClear();
});

beforeAll(async () => {
  await initI18n();
});

describe('OrderDetailPage', () => {
  it('render order DELIVERED → Table 2 rows + pill trong head + totals căn phải', async () => {
    vi.mocked(fetchMyOrder).mockResolvedValue(orderFixture());
    vi.mocked(fetchMyRmas).mockResolvedValue(EMPTY_RMA_PAGE);
    vi.mocked(fetchOrderTracking).mockResolvedValue(TRACKING);
    render(<OrderDetailPage id="a1b2c3d4e5f6g7h8" />);
    await screen.findByText('Đơn #A1B2C3D4');

    // Pill 6-token trong head-row
    const pill = document.querySelector('.od-head .pill--delivered');
    expect(pill).toBeTruthy();
    expect(pill!.textContent).toBe('Đã giao');

    // Items Table (ui-kit .uk-table): 2 rows theo order.items + header 3 cột
    expect(document.querySelectorAll('.uk-table thead th').length).toBe(3);
    expect(document.querySelectorAll('.uk-table tbody tr').length).toBe(2);
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByText('300.000đ')).toBeTruthy();
    expect(screen.getByText('450.000đ')).toBeTruthy();

    // Totals GIỮ div (không phải table) — Tổng cộng --c-danger qua od-totals__amount
    expect(screen.getByText('Tạm tính: 750.000đ')).toBeTruthy();
    expect(screen.getByText('Phí vận chuyển: 25.000đ')).toBeTruthy();
    const amount = document.querySelector('.od-totals__amount');
    expect(amount!.textContent).toBe('775.000đ');
  });

  it('click rma-create → modal mở: Textarea label/maxLength/hint đếm + QuantityStepper max clamp', async () => {
    vi.mocked(fetchMyOrder).mockResolvedValue(orderFixture());
    vi.mocked(fetchMyRmas).mockResolvedValue(EMPTY_RMA_PAGE);
    vi.mocked(fetchOrderTracking).mockResolvedValue(TRACKING);
    render(<OrderDetailPage id="a1b2c3d4e5f6g7h8" />);
    await screen.findByText('Đơn #A1B2C3D4');

    fireEvent.click(screen.getByTestId('rma-create'));
    const dialog = within(await screen.findByRole('dialog'));

    // Textarea: label + placeholder + maxLength 500 + hint đếm realtime
    const reason = dialog.getByLabelText('Lý do trả hàng') as HTMLTextAreaElement;
    expect(reason.placeholder).toContain('trong 7 ngày kể từ khi nhận hàng');
    expect(reason.maxLength).toBe(500);
    expect(dialog.getByText('0/500')).toBeTruthy();
    fireEvent.change(reason, { target: { value: 'abc' } });
    expect(dialog.getByText('3/500')).toBeTruthy();

    // QuantityStepper: value mặc định 0 (min 0 — không forced min 1)
    const row = dialog.getByText('Áo thun cotton').closest('.od-rma-item') as HTMLElement;
    const qtyInput = within(row)
      .getAllByLabelText('Số lượng trả Áo thun cotton')
      .find((el) => el.tagName === 'INPUT') as HTMLInputElement;
    expect(qtyInput.value).toBe('0');

    // Gõ quá max (99 > qty 2) → clamp về item.qty, KHÔNG vượt
    fireEvent.change(qtyInput, { target: { value: '99' } });
    expect(qtyInput.value).toBe('2');

    // Đủ max → nút + disabled (không tăng thêm được)
    const plus = within(row).getByLabelText('Tăng số lượng') as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
  });

  it('cancel modal mở (PENDING) → Escape đóng (useOverlay document keydown)', async () => {
    vi.mocked(fetchMyOrder).mockResolvedValue(orderFixture({ status: 'PENDING', trackingCode: null }));
    vi.mocked(fetchMyRmas).mockResolvedValue(EMPTY_RMA_PAGE);
    render(<OrderDetailPage id="a1b2c3d4e5f6g7h8" />);
    await screen.findByText('Đơn #A1B2C3D4');

    fireEvent.click(screen.getByRole('button', { name: 'Hủy đơn' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Giữ đơn')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tracking SHIPPED → tracking-block + timeline dot: event primary, mốc terminal success', async () => {
    vi.mocked(fetchMyOrder).mockResolvedValue(orderFixture({ status: 'SHIPPED' }));
    vi.mocked(fetchMyRmas).mockResolvedValue(EMPTY_RMA_PAGE);
    vi.mocked(fetchOrderTracking).mockResolvedValue(TRACKING);
    render(<OrderDetailPage id="a1b2c3d4e5f6g7h8" />);
    await screen.findByText('Đơn #A1B2C3D4');

    expect(screen.getByTestId('tracking-block')).toBeTruthy();
    expect(screen.getByText('Giao hàng thành công')).toBeTruthy();

    // Event tracking → dot --c-primary (2 events)
    expect(document.querySelectorAll('.od-timeline .od-timeline__item--primary .od-timeline__dot').length).toBe(2);

    // Timeline đơn: mốc DELIVERED (terminal) → dot --c-success; entry cũ → dot default
    expect(document.querySelectorAll('.od-timeline .od-timeline__item--success .od-timeline__dot').length).toBe(1);
    expect(document.querySelectorAll('.od-timeline__dot').length).toBe(5); // 2 events + 3 mốc đơn
  });
});
