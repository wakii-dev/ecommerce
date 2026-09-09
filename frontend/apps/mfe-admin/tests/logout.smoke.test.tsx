// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { authStore, configureAuth } from '@ecommerce/auth';
import { initI18n } from '@ecommerce/i18n';
import AdminApp from '../src/AdminApp';
import { initAdminShell } from '../src/bootstrap';

/** JWT giả (không verify chữ ký) — copy pattern mount.smoke.test.tsx. */
function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'u-admin',
    roles,
    email: 'admin@ecommerce.local',
    fullName: 'Quản Trị Viên'
  };
  const b64 = (o: object): string => {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  };
  return `.${b64(payload)}.`;
}

/** Response JSON chuẩn (DashboardPage cần array/arrayBuffer đúng kiểu). */
function json(body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]) as unknown as Headers,
    json: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer
  } as unknown as Response;
}

/** Fetch stub — refresh 401 (đã set token sẵn), dashboard APIs trả rỗng đúng kiểu. */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return { ok: false, status: 401, json: async () => ({}) } as unknown as Response;
      }
      if (url.includes('/stats/revenue-by-day')) return json([]);
      if (url.includes('/stats/top-products')) return json([]);
      if (url.includes('/stats/orders-summary'))
        return json({
          pending: 0, paid: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0, failed: 0,
          totalRevenue: 0, todayRevenue: 0, todayOrders: 0
        });
      if (url.includes('/admin/low-stock')) return json([]);
      return json({});
    })
  );
}

beforeAll(async () => {
  await initI18n();
  // jsdom thiếu ResizeObserver — recharts ResponsiveContainer cần (như mount.smoke).
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  authStore.logout();
  window.history.replaceState(null, '', '/');
});

/**
 * Logout KHÔNG được rơi vào dead-end: authStore notify → AdminApp phải
 * re-eval guard (subscribe), URL về loginPath của host (standalone '/' vì
 * không có route /login; shell giữ '/login' qua initAdminShell).
 * Test chạy THEO THỨ TỰ — shell test ở CUỐI vì initAdminShell set
 * navigateRef module-level (không có reset), làm test sau tưởng đang ở shell.
 */
describe('AdminApp logout (jsdom)', () => {
  it('standalone: logout → guard guest hiện hướng dẫn, URL về loginPath "/"', async () => {
    // Như main.tsx standalone (sau fix): loginPath '/' — không có route /login.
    configureAuth({ refreshUrl: '/api/identity/auth/refresh', identityBaseUrl: '', loginPath: '/' });
    stubFetch();
    authStore.setToken(fakeJwt(['admin']));
    render(<AdminApp />);
    const btn = await screen.findByRole('button', { name: 'Đăng xuất' });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
    // Guard phải flip về guest — EmptyState hướng dẫn, KHÔNG còn chrome admin.
    expect(await screen.findByText('Không có quyền')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shell: logout → navigate /login?next=<path hiện tại> (giữ next để quay lại)', async () => {
    const navigate = vi.fn();
    initAdminShell({
      HeaderSlots: {
        register: () => undefined,
        unregister: () => undefined
      },
      navigate
    });
    window.history.replaceState(null, '', '/admin');
    configureAuth({ refreshUrl: '/api/identity/auth/refresh', identityBaseUrl: '', loginPath: '/login' });
    stubFetch();
    authStore.setToken(fakeJwt(['admin']));
    render(<AdminApp />);
    const btn = await screen.findByRole('button', { name: 'Đăng xuất' });
    fireEvent.click(btn);
    await waitFor(() => {
      const to = navigate.mock.calls.at(-1)?.[0] as string | undefined;
      expect(to).toBe('/login?next=%2Fadmin');
    });
  });
});
