// SF-4 (FI-394 T9) — AffiliatePage: KPI stats testid đúng giá trị (clicks/
// conversions/earnings formatPrice), affiliate-code + affiliate-link ?ref=,
// ledger qua Table primitive (1 row + pill class map enum), LoyaltyPointsSection
// mount trong page (loyalty-balance), PENDING → pendingTitle KHÔNG KPI,
// loading → ListSkeleton (KHÔNG text "Đang tải"). Mock affiliateApi +
// loyaltyApi + bootstrap (globals:false → cleanup afterEach, pattern
// ordersPage.test.tsx). Copy clipboard KHÔNG test (navigator.clipboard).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import { formatPrice } from '@ecommerce/ui-kit';
import AffiliatePage from '../pages/affiliate/AffiliatePage';
import { appNavigate } from '../bootstrap';
import {
  fetchLedger,
  fetchProfile,
  type AffiliateProfile,
  type LedgerPage,
} from '../pages/affiliate/affiliateApi';
import { fetchMyLoyalty, type LoyaltyAccount } from '../pages/affiliate/loyaltyApi';

vi.mock('../bootstrap', () => ({
  appNavigate: vi.fn(),
  authReady: Promise.resolve(true)
}));

vi.mock('@ecommerce/auth', () => ({
  authStore: { isAuthenticated: vi.fn(() => true) }
}));

vi.mock('../pages/affiliate/affiliateApi', () => ({
  fetchProfile: vi.fn(),
  fetchLedger: vi.fn(),
  registerAffiliate: vi.fn()
}));

vi.mock('../pages/affiliate/loyaltyApi', () => ({
  fetchMyLoyalty: vi.fn()
}));

function profile(overrides: Partial<AffiliateProfile> = {}): AffiliateProfile {
  return {
    id: 'af1',
    code: 'KENH01',
    status: 'APPROVED',
    rate: 5,
    stats: { clicks: 10, conversions: 2, earnings: 500000 },
    ...overrides
  };
}

function ledgerPage(items: LedgerPage['items']): LedgerPage {
  return { items, page: 1, size: 20, total: items.length };
}

const ENTRY: LedgerPage['items'][number] = {
  id: 'le1',
  orderId: 'a1b2c3d4e5f6a7b8',
  orderTotal: 1200000,
  rate: 5,
  commission: 60000,
  status: 'PENDING',
  createdAt: '2026-09-01T10:00:00Z'
};

const LOYALTY: LoyaltyAccount = { userId: 'u1', balance: 100, totalEarned: 200 };

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(fetchProfile).mockReset();
  vi.mocked(fetchLedger).mockReset();
  vi.mocked(fetchMyLoyalty).mockReset();
  vi.mocked(fetchMyLoyalty).mockResolvedValue(LOYALTY);
  vi.mocked(appNavigate).mockClear();
});

beforeAll(async () => {
  await initI18n();
});

describe('AffiliatePage', () => {
  it('APPROVED → 3 KPI testid đúng giá trị, code KENH01, link ?ref=KENH01, ledger 1 row + pill', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile());
    vi.mocked(fetchLedger).mockResolvedValue(ledgerPage([ENTRY]));

    const { container } = render(<AffiliatePage />);

    expect(await screen.findByTestId('affiliate-clicks').then((el) => el.textContent)).toBe('10');
    expect(screen.getByTestId('affiliate-conversions').textContent).toBe('2');
    // Expected qua formatPrice — Intl vi-VN chèn NARROW NO-BREAK SPACE (U+202F)
    // trước ₫, literal space thường trong test sẽ vỡ falsy-diff.
    expect(screen.getByTestId('affiliate-earnings').textContent).toBe(
      formatPrice(500000)
    );
    expect(screen.getByTestId('affiliate-code').textContent).toBe('KENH01');
    expect(screen.getByTestId('affiliate-link').textContent).toContain('?ref=KENH01');

    // Ledger — Table primitive: header 5 cột, 1 row, mã đơn slice 8, pill PENDING.
    expect(container.querySelectorAll('.af-ledger thead th')).toHaveLength(5);
    expect(container.querySelectorAll('.af-ledger tbody tr')).toHaveLength(1);
    expect(screen.getByText('a1b2c3d4…')).toBeTruthy();
    const pill = container.querySelector('.af-ledger .pill--pending');
    expect(pill?.textContent).toBe('PENDING');

    // Loyalty section render trong page — balance 100 (fetchMyLoyalty mock).
    expect(
      await screen.findByTestId('loyalty-balance').then((el) => el.textContent)
    ).toBe('100');
  });

  it('PENDING → pendingTitle hiện, KHÔNG KPI stats', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(
      profile({ code: null, status: 'PENDING' })
    );

    render(<AffiliatePage />);

    expect(await screen.findByText('Hồ sơ đã gửi — chờ duyệt')).toBeTruthy();
    expect(screen.queryByTestId('affiliate-clicks')).toBeNull();
    expect(screen.queryByTestId('affiliate-code')).toBeNull();
    expect(fetchLedger).not.toHaveBeenCalled();
  });

  it('loading → ListSkeleton, KHÔNG text "Đang tải", KHÔNG section loyalty', () => {
    vi.mocked(fetchProfile).mockReturnValue(new Promise(() => {}));

    const { container } = render(<AffiliatePage />);

    expect(container.querySelector('.uk-sk-list')).toBeTruthy();
    expect(screen.queryByText(/Đang tải/)).toBeNull();
    expect(screen.queryByTestId('loyalty-section')).toBeNull();
  });
});
