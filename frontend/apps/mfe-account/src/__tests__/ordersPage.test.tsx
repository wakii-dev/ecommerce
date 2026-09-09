// SF-4 (FI-394 T5) — OrdersPage: pill class đúng slug theo status (FAILED →
// .pill--failed family cancelled), formatVnd/link href/click appNavigate,
// ListSkeleton khi tải (aria-busy, KHÔNG text "Đang tải"), EmptyState
// empty + CTA, EmptyState error + retry. Globals:false → cleanup afterEach
// (pattern accountLayout.test.tsx).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import OrdersPage, { formatVnd } from '../pages/orders/OrdersPage';
import { appNavigate } from '../bootstrap';
import { fetchMyOrders, type OrderStatus, type OrderSummary } from '../pages/orders/ordersApi';

vi.mock('../bootstrap', () => ({
  appNavigate: vi.fn(),
  authReady: Promise.resolve(true)
}));

vi.mock('@ecommerce/auth', () => ({
  authStore: { isAuthenticated: vi.fn(() => true) }
}));

vi.mock('../pages/orders/ordersApi', () => ({
  fetchMyOrders: vi.fn()
}));

function summary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'a1b2c3d4e5f6',
    status: 'PENDING',
    itemsCount: 3,
    total: 1200000,
    currency: 'VND',
    paymentMethod: 'stripe',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides
  };
}

const PAGE = (items: OrderSummary[]) => ({ items, page: 1, size: 20, total: items.length });

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(fetchMyOrders).mockReset();
  vi.mocked(appNavigate).mockClear();
});

beforeAll(async () => {
  await initI18n();
});

describe('OrdersPage', () => {
  it('render 2 đơn → pill class theo status, formatVnd, link href + click appNavigate', async () => {
    vi.mocked(fetchMyOrders).mockResolvedValue(
      PAGE([
        summary({ id: 'a1b2c3d4e5f6', status: 'PENDING', total: 1200000 }),
        summary({ id: 'f6e5d4c3b2a1', status: 'FAILED', total: 99000, itemsCount: 1, paymentMethod: 'cod' })
      ])
    );
    render(<OrdersPage />);
    await screen.findByText('Đơn #A1B2C3D4');

    // Pill class map ĐÚNG token — PENDING → pending (vàng), FAILED → failed (đỏ family cancelled)
    expect(document.querySelector('.pill--pending')!.textContent).toBe('Chờ thanh toán');
    expect(document.querySelector('.pill--failed')!.textContent).toBe('Thất bại');

    // formatVnd vi-VN: 1200000 → '1.200.000đ'
    expect(formatVnd(1200000)).toBe('1.200.000đ');
    expect(screen.getByText('1.200.000đ')).toBeTruthy();

    // Meta: itemsCount interpolation + paymentMethod label
    expect(screen.getByText('Đơn hàng của tôi')).toBeTruthy();
    expect(screen.getByText(/3 sản phẩm/)).toBeTruthy();
    expect(screen.getByText(/COD/)).toBeTruthy(); // đơn 2 paymentMethod cod

    // Link giữ href thật + click → preventDefault + appNavigate
    const link = screen.getAllByRole('link').find((el) => el.getAttribute('href') === '/account/orders/a1b2c3d4e5f6');
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(appNavigate).toHaveBeenCalledWith('/account/orders/a1b2c3d4e5f6');
  });

  it('7 status → đủ 7 slug pill (FAILED family cancelled giữ slug riêng)', async () => {
    const all: OrderStatus[] = ['PENDING', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'FAILED'];
    vi.mocked(fetchMyOrders).mockResolvedValue(PAGE(all.map((status, i) => summary({ id: `id${i}`, status }))));
    render(<OrdersPage />);
    await screen.findByText('Đơn #ID0');
    for (const slug of ['pending', 'paid', 'confirmed', 'shipped', 'delivered', 'cancelled', 'failed']) {
      expect(document.querySelector(`.pill--${slug}`)).toBeTruthy();
    }
  });

  it('loading → ListSkeleton (aria-busy) + KHÔNG text "Đang tải đơn hàng…"', () => {
    vi.mocked(fetchMyOrders).mockReturnValue(new Promise(() => {}));
    render(<OrdersPage />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText('Đang tải đơn hàng…')).toBeNull();
  });

  it('empty → EmptyState "Bạn chưa có đơn hàng nào" + CTA → appNavigate("/")', async () => {
    vi.mocked(fetchMyOrders).mockResolvedValue(PAGE([]));
    render(<OrdersPage />);
    await screen.findByText('Bạn chưa có đơn hàng nào');
    expect(screen.getByText('Khám phá hàng ngàn sản phẩm đang khuyến mãi hot.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục mua sắm' }));
    expect(appNavigate).toHaveBeenCalledWith('/');
  });

  it('error → EmptyState lỗi + nút Thử lại (retry giữ window.location.reload)', async () => {
    vi.mocked(fetchMyOrders).mockRejectedValue(new Error('boom'));
    render(<OrdersPage />);
    await screen.findByText('Không tải được đơn hàng');
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
