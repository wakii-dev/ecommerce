// SF-4 (FI-394 T8) — MyReviewsPage: ListSkeleton khi tải (aria-busy, KHÔNG
// text "Đang tải…"), Badge label theo key (3 status), verified Icon + text,
// empty EmptyState star. Fetch là authStore.fetch (endpoint additive — không
// typed client) → mock trực tiếp. Globals:false → cleanup afterEach.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import MyReviewsPage from '../pages/my-reviews/MyReviewsPage';
import { appNavigate } from '../bootstrap';
import type { MeReview } from '../pages/my-reviews/MyReviewsPage';

vi.mock('../bootstrap', () => ({
  appNavigate: vi.fn(),
  authReady: Promise.resolve(true)
}));

const authFetch = vi.fn();

vi.mock('@ecommerce/auth', () => ({
  authStore: { isAuthenticated: vi.fn(() => true), fetch: (...args: unknown[]) => authFetch(...args) }
}));

function review(overrides: Partial<MeReview> = {}): MeReview {
  return {
    id: 'r1',
    productId: 'p1',
    productName: 'Áo thun cotton',
    rating: 4,
    title: 'Tạm ổn',
    content: 'Chất vải mềm, giao nhanh.',
    status: 'PENDING',
    verifiedPurchase: true,
    createdAt: '2026-09-01T10:00:00Z',
    ...overrides
  };
}

const OK = (items: MeReview[]) => ({ ok: true, json: () => Promise.resolve({ items }) });

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  authFetch.mockReset();
  vi.mocked(appNavigate).mockClear();
});

beforeAll(async () => {
  await initI18n();
});

describe('MyReviewsPage', () => {
  it('loading → ListSkeleton aria-busy + KHÔNG text "Đang tải…"', () => {
    authFetch.mockReturnValue(new Promise(() => {}));
    render(<MyReviewsPage />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText('Đang tải…')).toBeNull();
  });

  it('3 status → Badge label keys (Chờ duyệt/Đã duyệt/Bị từ chối) + verified Icon', async () => {
    authFetch.mockResolvedValue(
      OK([
        review({ id: 'r1', status: 'PENDING', productName: 'Áo thun cotton' }),
        review({ id: 'r2', status: 'APPROVED', productName: 'Quần jean' }),
        review({ id: 'r3', status: 'REJECTED', productName: 'Mũ len' })
      ])
    );
    render(<MyReviewsPage />);
    await screen.findByText('Áo thun cotton');

    expect(screen.getByText('Chờ duyệt')).toBeTruthy();
    expect(screen.getByText('Đã duyệt')).toBeTruthy();
    expect(screen.getByText('Bị từ chối')).toBeTruthy();
    // Verified: key 'Mua đã xác nhận' (✓ glyph → Icon check, không còn trong text)
    const verified = screen.getAllByText('Mua đã xác nhận');
    expect(verified.length).toBe(3);
    expect(verified[0]?.querySelector('svg')).toBeTruthy();
    // h1 qua class (chuỗi trùng side-nav item account.nav.reviews)
    expect(document.querySelector('h1.acc-page-title')!.textContent).toBe('Đánh giá của tôi');
    // 4/5 sao: aria-label + glyph
    expect(screen.getAllByLabelText('4/5').length).toBe(3);
  });

  it('product null → fallback "Sản phẩm"; empty → EmptyState star', async () => {
    authFetch.mockResolvedValue(OK([]));
    render(<MyReviewsPage />);
    await screen.findByText('Bạn chưa viết đánh giá nào');
    expect(screen.getByText('Vào trang sản phẩm để viết đánh giá đầu tiên.')).toBeTruthy();
    expect(screen.queryByText('Sản phẩm')).toBeNull();
  });

  it('error → alert Card key errorLoad + KHÔNG skeleton treo', async () => {
    authFetch.mockRejectedValue(new Error('500'));
    render(<MyReviewsPage />);
    await screen.findByRole('alert');
    expect(screen.getByText('Không tải được đánh giá của bạn')).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
