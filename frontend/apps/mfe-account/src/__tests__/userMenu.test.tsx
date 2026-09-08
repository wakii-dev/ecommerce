// SF-4 (FI-394 T3) — UserMenu keyboard unit tests: role=menuitem roving focus
// (tabIndex=-1), ArrowDown mở + focus item đầu, Arrow wrap, Home/End, ArrowUp
// mở + focus item cuối, Escape đóng + restore focus trigger, Tab đóng tự nhiên,
// click Đăng xuất chạy logout flow GIỮ NGUYÊN. Mock useAuth + logout +
// appNavigate — KHÔNG render AuthProvider thật. Unit assert BEHAVIOR, không
// assert label text cứng (keys đã parity-check ở packages/i18n).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import { useAuth } from '@ecommerce/auth';
import AuthWidget from '../AuthWidget';
import { logout } from '../api';
import { appNavigate } from '../bootstrap';

vi.mock('@ecommerce/auth', () => ({ useAuth: vi.fn() }));
vi.mock('../api', () => ({ logout: vi.fn(() => Promise.resolve()) }));
vi.mock('../bootstrap', () => ({ appNavigate: vi.fn() }));

const mockClearLocal = vi.fn();

// AuthWidget chỉ đọc isAuthenticated (default export) + user/logout (UserMenu).
const mockSignedIn = () => {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: true,
    user: { fullName: 'Nguyen Van A', email: 'a@test.vn' },
    logout: mockClearLocal
  } as unknown as ReturnType<typeof useAuth>);
};

// globals:false → RTL không auto-cleanup — dọn DOM thủ công (pattern T1/T2).
afterEach(() => {
  cleanup();
});

beforeAll(async () => {
  await initI18n();
});

beforeEach(() => {
  mockClearLocal.mockClear();
  vi.mocked(logout).mockClear();
  vi.mocked(appNavigate).mockClear();
  mockSignedIn();
});

// ArrowDown từ trigger (đóng) → mở + focus item đầu; trả về trigger node.
const openWithArrowDown = () => {
  const trigger = screen.getByRole('button');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return trigger;
};

describe('UserMenu — keyboard + role=menu', () => {
  it('click trigger → mở menu: 3 role="menuitem", aria-expanded đổi, trigger giữ focus', () => {
    render(<AuthWidget />);
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    // click mở KHÔNG đẩy focus vào item (mouse flow — focus roving chỉ khi keyboard;
    // jsdom không set focus khi click → activeElement vẫn body/trigger, không phải item)
    expect(items).not.toContain(document.activeElement);
  });

  it('ArrowDown từ trigger → mở + focus item 1 (roving tabIndex=-1); ×3 wrap về item 1; ArrowUp từ item 1 → item cuối; Home/End', () => {
    render(<AuthWidget />);
    const trigger = openWithArrowDown();
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(document.activeElement).toBe(items[0]);
    // roving focus thật: item không tab-stop, focus qua .focus()
    items.forEach((it) => expect(it.getAttribute('tabindex')).toBe('-1'));
    // ArrowDown×3: item1 → item2 → item3 → wrap về item1
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    // ArrowUp từ item 1 → wrap lên item cuối; End → item cuối; Home → item đầu
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('ArrowUp từ trigger (đóng) → mở + focus item CUỐI', () => {
    render(<AuthWidget />);
    const trigger = screen.getByRole('button');
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('Escape từ item → menu đóng + focus RESTORE về trigger; Tab từ item → đóng (không giữ focus trong menu)', () => {
    render(<AuthWidget />);
    const trigger = openWithArrowDown();
    expect(screen.queryByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    // mở lại bằng ArrowDown rồi Tab — menu đóng, KHÔNG preventDefault (focus đi tiếp tự nhiên)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('click item Đăng xuất (item 3) → logout flow gọi đủ (logout → clearLocal → appNavigate /login) + menu đóng', async () => {
    render(<AuthWidget />);
    fireEvent.click(screen.getByRole('button'));
    const items = screen.getAllByRole('menuitem');
    fireEvent.click(items[items.length - 1]!); // item cuối — Đăng xuất
    expect(screen.queryByRole('menu')).toBeNull(); // đóng ngay khi chọn
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
      expect(mockClearLocal).toHaveBeenCalledTimes(1);
      expect(appNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
