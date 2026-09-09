import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AuthProvider, authStore, logout } from '@ecommerce/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthMenu } from '../index';
import { renderWithProviders } from './setup';

/**
 * AuthMenu (FI-398 T9, spec §3.7): guest → 2 link Đăng nhập/Đăng ký;
 * user → trigger displayName + menu 3 item; keyboard roving focus GIỮ
 * (ArrowDown mở + focus item đầu, ArrowDown/Up wrap, Escape đóng + restore
 * focus trigger, Space chọn như click); logout → chuỗi GIỮ: logout (API) →
 * clearLocal (useAuth.logout = authStore.logout) → onNavigate('/login').
 *
 * '@ecommerce/auth' mock CỤC BỘ (importOriginal spread actual): chỉ `logout`
 * thành spy — tránh network thật (POST identity); AuthProvider/useAuth/
 * authStore DÙNG THẬT (seed phiên bằng setToken + JWT giả — pattern
 * authStore.test.ts; token KHÔNG verify chữ ký client-side).
 * i18n qua renderWithProviders (setup T13 — P1 critic, instance thật bọc
 * I18nextProvider).
 */
vi.mock('@ecommerce/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ecommerce/auth')>();
  return { ...actual, logout: vi.fn(() => Promise.resolve()) };
});

/** JWT giả (payload base64url, không cần chữ ký thật — client không verify). */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (s: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(s)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

const USER_JWT = makeJwt({
  sub: 'u1',
  email: 'a@test.dev',
  fullName: 'Nguyen Van A',
  roles: []
});

beforeEach(() => {
  authStore.setToken(null);
  vi.clearAllMocks(); // xóa call history spy logout giữa các case (giữ impl)
});

afterEach(() => {
  // act() quanh reset seed: AuthProvider/Vite subscriber còn mounted lúc
  // afterEach (RTL cleanup chạy sau user hooks) — setToken ngoài act sinh
  // warning React (noise log, P2 W5 — cosmetic, không chase zero-warning).
  act(() => {
    authStore.setToken(null);
  });
});

function renderMenu(onNavigate?: (to: string) => void) {
  return renderWithProviders(
    <AuthProvider>
      <AuthMenu onNavigate={onNavigate} />
    </AuthProvider>,
    { lang: 'vi' }
  );
}

/** 3 menuitem với tuple type — noUncheckedIndexedAccess tính index access
 *  là possibly-undefined; helper assert length + trả tuple non-null. */
function threeMenuItems(): [HTMLElement, HTMLElement, HTMLElement] {
  const items = screen.getAllByRole('menuitem');
  if (items.length !== 3 || !items[0] || !items[1] || !items[2]) {
    throw new Error(`expected menu 3 item, got ${items.length}`);
  }
  return [items[0], items[1], items[2]];
}

describe('AuthMenu — guest', () => {
  it('authStore unauth → auth-guest + 2 link Đăng nhập/Đăng ký (href giữ)', async () => {
    await renderMenu();
    expect(screen.getByTestId('auth-guest')).toBeTruthy();
    expect(screen.queryByTestId('auth-user')).toBeNull();
    const login = screen.getByRole('link', { name: 'Đăng nhập' });
    const register = screen.getByRole('link', { name: 'Đăng ký' });
    expect(login.getAttribute('href')).toBe('/login');
    expect(register.getAttribute('href')).toBe('/register');
  });

  /** React 18 delegate listener ở container — document listener chạy SAU cùng
   *  trong bubble → thấy defaultPrevented CUỐI (sau handler React). */
  function clickAndCapturePrevented(el: Element): boolean {
    let prevented = false;
    const onDocClick = (e: MouseEvent): void => {
      prevented = e.defaultPrevented;
    };
    document.addEventListener('click', onDocClick);
    fireEvent.click(el);
    document.removeEventListener('click', onDocClick);
    return prevented;
  }

  it('guest + onNavigate → click link preventDefault + onNavigate(to)', async () => {
    const onNavigate = vi.fn();
    await renderMenu(onNavigate);
    const login = screen.getByRole('link', { name: 'Đăng nhập' });
    expect(clickAndCapturePrevented(login)).toBe(true); // router shell điều hướng, href bị chặn
    expect(onNavigate).toHaveBeenCalledWith('/login');
  });

  it('guest KHÔNG onNavigate → click link KHÔNG preventDefault (href tự nhiên)', async () => {
    await renderMenu();
    const login = screen.getByRole('link', { name: 'Đăng nhập' });
    // stderr "Not implemented: navigation" từ jsdom SAU test này = kỳ vọng:
    // anchor KHÔNG bị chặn → jsdom thử follow /login (browser thật sẽ điều hướng).
    expect(clickAndCapturePrevented(login)).toBe(false); // anchor href điều hướng tự nhiên
  });
});

describe('AuthMenu — user menu', () => {
  it('authStore user → auth-user + trigger displayName (fullNames[0])', async () => {
    authStore.setToken(USER_JWT);
    await renderMenu();
    expect(screen.getByTestId('auth-user')).toBeTruthy();
    expect(screen.queryByTestId('auth-guest')).toBeNull();
    expect(screen.getByRole('button').textContent).toContain('Nguyen');
  });

  it('click trigger mở menu → 3 menuitem Tài khoản/Đơn hàng của tôi/Đăng xuất', async () => {
    authStore.setToken(USER_JWT);
    await renderMenu();
    fireEvent.click(screen.getByRole('button'));
    const [i0, i1, i2] = threeMenuItems();
    expect(i0.textContent).toBe('Tài khoản');
    expect(i1.textContent).toBe('Đơn hàng của tôi');
    expect(i2.textContent).toBe('Đăng xuất');
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('click Đăng xuất (onNavigate) → logout spy → clearLocal → onNavigate(\'/login\')', async () => {
    authStore.setToken(USER_JWT);
    const onNavigate = vi.fn();
    await renderMenu(onNavigate);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await waitFor(() => expect(vi.mocked(logout)).toHaveBeenCalledTimes(1)); // API logout
    await waitFor(() => expect(authStore.isAuthenticated()).toBe(false)); // clearLocal
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/login')); // điều hướng
  });

  it('click Đăng xuất KHÔNG onNavigate → window.location.assign(\'/login\') nhánh standalone', async () => {
    authStore.setToken(USER_JWT);
    // jsdom Location.assign non-configurable + navigation Not-implemented →
    // recipe chuẩn: thay nguyên window.location bằng stub configurable.
    const realLocation = window.location;
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } });
    try {
      await renderMenu();
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      await waitFor(() => expect(vi.mocked(logout)).toHaveBeenCalledTimes(1));
      expect(authStore.isAuthenticated()).toBe(false);
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    }
  });
});

describe('AuthMenu — keyboard roving focus (FI-390 GIỮ)', () => {
  it('ArrowDown trên trigger → mở + focus item ĐẦU; ArrowDown/Up di chuyển + wrap; Escape đóng + focus về trigger', async () => {
    authStore.setToken(USER_JWT);
    await renderMenu();
    const trigger = screen.getByRole('button');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await screen.findAllByRole('menuitem'); // menu render xong
    const [i0, i1, i2] = threeMenuItems();
    await waitFor(() => expect(document.activeElement).toBe(i0)); // focus item đầu

    // ArrowDown: item0 → item1
    fireEvent.keyDown(i0, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(i1);

    // ArrowUp: item1 → item0; wrap: item0 → item CUỐI
    fireEvent.keyDown(i1, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(i0);
    fireEvent.keyDown(i0, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(i2);

    // Escape trên item → đóng + restore focus trigger
    fireEvent.keyDown(i2, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ArrowUp trên trigger → mở + focus item CUỐI; Home/End jump; Tab đóng', async () => {
    authStore.setToken(USER_JWT);
    await renderMenu();
    const trigger = screen.getByRole('button');

    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    await screen.findAllByRole('menuitem'); // menu render xong
    const [i0, , i2] = threeMenuItems();
    await waitFor(() => expect(document.activeElement).toBe(i2)); // focus item cuối

    fireEvent.keyDown(i2, { key: 'Home' });
    expect(document.activeElement).toBe(i0);
    fireEvent.keyDown(i0, { key: 'End' });
    expect(document.activeElement).toBe(i2);

    fireEvent.keyDown(i2, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull(); // đóng, focus đi tiếp tự nhiên
  });

  it('Space trên menuitem → chọn như click (select): onNavigate(to) + menu đóng', async () => {
    // Space KHÔNG activate <a> mặc định — AuthMenu xử lý ' ' như click (P2 W5)
    authStore.setToken(USER_JWT);
    const onNavigate = vi.fn();
    await renderMenu(onNavigate);
    const trigger = screen.getByRole('button');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await screen.findAllByRole('menuitem'); // menu render xong
    const [i0] = threeMenuItems();
    await waitFor(() => expect(document.activeElement).toBe(i0)); // focus item đầu

    fireEvent.keyDown(i0, { key: ' ' });
    expect(onNavigate).toHaveBeenCalledWith('/account'); // select(it) → onNavigate
    expect(screen.queryByRole('menu')).toBeNull(); // menu đóng sau chọn
  });
});
