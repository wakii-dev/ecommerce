// SF-4 (FI-394 T1) — AccountLayout unit tests (jsdom): 6 link + href, active
// state (aria-current + class), icon decorative, appNavigate click, và
// modifier-click PHẢI cho qua mặc định trình duyệt (mở tab mới).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import { AccountLayout } from '../AccountLayout';
import { appNavigate } from '../bootstrap';

vi.mock('../bootstrap', () => ({
  appNavigate: vi.fn(),
  authReady: Promise.resolve(true)
}));

// globals: false → RTL không tự đăng ký auto-cleanup — dọn DOM thủ công để
// các render không cộng dồn vào document; clear spy giữa các test.
afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(appNavigate).mockClear();
});

const EXPECTED_HREFS = [
  '/account',
  '/account/orders',
  '/account/wishlist',
  '/account/reviews',
  '/account/affiliate',
  '/account/affiliate#loyalty'
];

describe('AccountLayout', () => {
  beforeAll(async () => {
    await initI18n();
  });

  it('render đúng 6 link nav với href theo thứ tự', () => {
    render(
      <AccountLayout active="account">
        <div>nội dung trang</div>
      </AccountLayout>
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(EXPECTED_HREFS);
    // children render xuyên qua layout
    expect(screen.getByText('nội dung trang')).toBeTruthy();
  });

  it('active="orders" → link orders aria-current="page" + class active, các link khác không', () => {
    render(
      <AccountLayout active="orders">
        <div>x</div>
      </AccountLayout>
    );
    const links = screen.getAllByRole('link');
    const ordersLink = links.find((link) => link.getAttribute('href') === '/account/orders');
    expect(ordersLink).toBeTruthy();
    expect(ordersLink!.getAttribute('aria-current')).toBe('page');
    expect(ordersLink!.className).toContain('acc-nav__link--active');
    const activeCount = links.filter((link) => link.getAttribute('aria-current') === 'page');
    expect(activeCount).toHaveLength(1);
  });

  it('icon trang trí aria-hidden (không đọc bởi screen reader)', () => {
    render(
      <AccountLayout active="account">
        <div>x</div>
      </AccountLayout>
    );
    const icons = document.querySelectorAll('.acc-nav__link svg');
    expect(icons).toHaveLength(6);
    icons.forEach((icon) => expect(icon.getAttribute('aria-hidden')).toBe('true'));
  });

  it('click link thường → preventDefault + appNavigate(to)', () => {
    render(
      <AccountLayout active="wishlist">
        <div>x</div>
      </AccountLayout>
    );
    fireEvent.click(screen.getAllByRole('link')[2]!); // /account/wishlist
    expect(appNavigate).toHaveBeenCalledWith('/account/wishlist');
  });

  it('modifier-click (meta/ctrl/shift/alt) → KHÔNG appNavigate (cho qua mặc định)', async () => {
    // Click không-preventDefault = default action được phép → jsdom (không có
    // navigation) log "Not implemented: navigation" qua console.error trên
    // timer 0ms — flush NGAY TRONG test khi spy còn active, đúng test này.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <AccountLayout active="account">
          <div>x</div>
        </AccountLayout>
      );
      const link = screen.getAllByRole('link')[0]!;
      fireEvent.click(link, { metaKey: true });
      fireEvent.click(link, { ctrlKey: true });
      fireEvent.click(link, { shiftKey: true });
      fireEvent.click(link, { altKey: true });
      expect(appNavigate).not.toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      errSpy.mockRestore();
    }
  });
});
