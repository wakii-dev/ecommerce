// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { authStore } from '@ecommerce/auth';
import { initI18n } from '@ecommerce/i18n';
import AdminApp from '../src/AdminApp';

/** JWT giả (không verify chữ ký — decode JwtPayload phía client). */
function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'u-admin',
    roles,
    email: 'admin@ecommerce.local',
    fullName: 'Quản Trị Viên'
  };
  const b64 = (o: object): string => {
    // btoa chỉ nhận Latin1 — encode UTF-8 bytes trước (tên tiếng Việt có dấu).
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  };
  return `.${b64(payload)}.`;
}

/** Response JSON giả dùng chung (fetch stub theo URL).
 *  SF-10: executeRequest đọc arrayBuffer (binary-safe) — phải cung cấp. */
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

/** Fetch stub theo URL — đủ cho guard + Dashboard/Dashboard queries. */
function stubFetch(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => stubRoute(input)));
}

function stubRoute(input: RequestInfo | URL): Promise<Response> {
  return (async () => {
    const url = String(input);
    if (url.includes('/auth/refresh')) return json({ accessToken: fakeJwt(['admin']) });
    if (url.includes('/admin/products')) return json({ items: [], page: 1, size: 10, total: 0 });
    if (url.includes('/admin/categories')) return json([]);
    if (url.includes('/admin/low-stock')) return json([]);
    if (url.includes('/stats/orders-summary'))
      return json({
        pending: 0, paid: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0, failed: 0,
        totalRevenue: 0, todayRevenue: 0, todayOrders: 0
      });
    if (url.includes('/stats/revenue-by-day')) return json([]);
    if (url.includes('/stats/top-products')) return json([]);
    if (url.includes('/admin/reviews')) return json({ items: [], page: 1, size: 20, total: 0 });
    return json({});
  })();
}

beforeAll(async () => {
  await initI18n();
  // jsdom thiếu ResizeObserver — recharts ResponsiveContainer cần.
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

describe('AdminApp mount smoke (jsdom)', () => {
  it('guest standalone (refresh fail) → hiện hướng dẫn, KHÔNG render layout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response)
    );
    render(<AdminApp />);
    await waitFor(() => {
      // i18n phải dịch được (initI18n đăng ký initReactI18next) — không chấp nhận key thô
      expect(screen.getByText('Không có quyền')).toBeTruthy();
    });
    // Link đăng nhập sang shell — next=%2Fadmin để login xong quay lại admin
    const loginLink = screen.getByRole('link', { name: 'Đăng nhập qua shell' }) as HTMLAnchorElement;
    expect(loginLink.href).toBe('http://localhost:5173/login?next=%2Fadmin');
    // Không có sidebar nav
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('admin token → render layout: sidebar 6 nav items + topbar user', async () => {
    stubFetch();
    authStore.setToken(fakeJwt(['customer', 'admin']));
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    // 6 nav links (pack: Dashboard, Products, Categories, Coupons, Reviews, Orders)
    const links = screen.getAllByRole('link', { name: /Tổng quan|Sản phẩm|Danh mục|Mã giảm giá|Đánh giá|Đơn hàng/ });
    expect(links.length).toBe(6);
    // Topbar có user info (decode từ JWT)
    expect(screen.getByTestId('admin-user').textContent).toContain('Quản Trị Viên');
    // Dashboard KPI tile render (label đầu tiên)
    await waitFor(() => {
      expect(screen.getByText('Doanh thu hôm nay')).toBeTruthy();
    });
  });

  it('customer (thiếu role admin) → trang 403', async () => {
    stubFetch();
    authStore.setToken(fakeJwt(['customer']));
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByText('Không có quyền')).toBeTruthy();
    });
  });

  it('refresh thua race (401 rồi 200 — cookie bị instance account xoay) → retry ĐÚNG 1 lần rồi vào layout', async () => {
    const calls: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/refresh')) {
          calls.push(Date.now());
          if (calls.length === 1) {
            return { ok: false, status: 401, json: async () => ({}) } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]) as unknown as Headers,
            json: async () => ({ accessToken: fakeJwt(['admin']) })
          } as unknown as Response;
        }
        if (url.includes('/admin/products')) return json({ items: [], page: 1, size: 10, total: 0 });
        if (url.includes('/admin/categories')) return json([]);
        if (url.includes('/admin/low-stock')) return json([]);
        if (url.includes('/stats')) return json({});
        return json({});
      })
    );
    render(<AdminApp />);
    await waitFor(
      () => {
        expect(screen.getByRole('navigation')).toBeTruthy();
      },
      { timeout: 3000 }
    );
    // Đúng 2 lần gọi refresh (lần 1 thua race, lần 2 retry sau khi cookie ổn định)
    expect(calls.length).toBe(2);
  });

  it('mount 2 lần khi refresh đang treo → chia sẻ ĐÚNG 1 boot-refresh, không bắn call thứ 2', async () => {
    let resolveFirst!: (v: Response) => void;
    const firstRefresh = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let refreshCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/refresh')) {
          refreshCount += 1;
          if (refreshCount === 1) return firstRefresh;
          return {
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]) as unknown as Headers,
            json: async () => ({ accessToken: fakeJwt(['admin']) })
          } as unknown as Response;
        }
        if (url.includes('/admin/products')) return json({ items: [], page: 1, size: 10, total: 0 });
        if (url.includes('/admin/categories')) return json([]);
        if (url.includes('/admin/low-stock')) return json([]);
        if (url.includes('/stats')) return json({});
        return json({});
      })
    );
    const first = render(<AdminApp />);
    // Mount lần 2 khi refresh đầu chưa resolve — phải tái sử dụng promise chung.
    first.unmount();
    render(<AdminApp />);
    // Cho microtask chạy: nếu mount 2 tự bắn refresh riêng thì callCount đã = 2.
    await new Promise((r) => setTimeout(r, 20));
    expect(refreshCount).toBe(1);
    resolveFirst({
      ok: false,
      status: 401,
      json: async () => ({})
    } as unknown as Response);
    await waitFor(
      () => {
        expect(screen.getByRole('navigation')).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });

  it('theme mount = admin, unmount restore', async () => {
    stubFetch();
    authStore.setToken(fakeJwt(['admin']));
    document.documentElement.dataset.theme = 'storefront';
    const { unmount } = render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    expect(document.documentElement.dataset.theme).toBe('admin');
    unmount();
    expect(document.documentElement.dataset.theme).toBe('storefront');
  });
});
