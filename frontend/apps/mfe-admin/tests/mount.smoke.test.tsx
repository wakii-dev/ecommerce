// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
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
    await waitFor(
      () => {
        // i18n phải dịch được (initI18n đăng ký initReactI18next) — không chấp nhận key thô
        expect(screen.getByText('Không có quyền')).toBeTruthy();
      },
      // session-sync (FI-399) wrap refresh: fallback-mode (jsdom không có
      // navigator.locks) tự retry sau backoff 400ms BÊN TRONG boot-retry
      // thứ 2 → guard settle ~1s, waitFor default 1s không đủ (đo thực tế
      // 472→996ms). Precedent timeout 3000: test "refresh thua race".
      { timeout: 3000 }
    );
    // Link đăng nhập sang shell — next=%2Fadmin để login xong quay lại admin.
    // feab2d6: toàn bộ nav qua gateway — href RELATIVE (1-origin), test assert
    // path+query component kiểm soát, KHÔNG bake origin dev cũ (5173) vào.
    const loginLink = screen.getByRole('link', { name: 'Đăng nhập qua shell' }) as HTMLAnchorElement;
    expect(loginLink.getAttribute('href')).toBe('/login?next=%2Fadmin');
    // Không có sidebar nav
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('admin token → render layout: sidebar 11 nav links / 5 groups + topbar user', async () => {
    stubFetch();
    authStore.setToken(fakeJwt(['customer', 'admin']));
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    // 11 nav links / 5 groups (SF-5 FI-395 T2 sidebar nhóm: Dashboard,
    // Products, Categories, Coupons, Orders, RMA, Reviews, Affiliates,
    // Newsletter, Loyalty, Audit)
    const nav = screen.getByRole('navigation');
    expect(within(nav).getAllByRole('link').length).toBe(11);
    expect(nav.querySelectorAll('.admin-nav-group').length).toBe(5);
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
    // Chờ boot-refresh #1 THẬT SỰ bắn (session-sync wrap + pipeline jsdom làm
    // POST đầu muộn ~70ms — đo scratch 2026-09-10; chờ cứng 20ms cũ luôn 0).
    await waitFor(() => expect(refreshCount).toBe(1), { timeout: 3000 });
    // Cho microtask chạy: nếu mount 2 tự bắn refresh riêng thì callCount đã = 2.
    await new Promise((r) => setTimeout(r, 100));
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

  it('theme live remap (MutationObserver): shell đổi theme giữa phiên admin → remap ngay; unmount restore', async () => {
    stubFetch();
    authStore.setToken(fakeJwt(['admin']));
    document.documentElement.dataset.theme = 'dark';
    const { unmount } = render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    expect(document.documentElement.dataset.theme).toBe('admin-dark');
    // Shell ThemeToggle flip dark→light GIỮA phiên admin → observer remap 'admin'
    document.documentElement.dataset.theme = 'light';
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('admin');
    });
    // Flip ngược light→dark → 'admin-dark'
    document.documentElement.dataset.theme = 'dark';
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('admin-dark');
    });
    unmount();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('theme pre-existing dark lúc mount → admin-dark; unmount restore dark', async () => {
    stubFetch();
    authStore.setToken(fakeJwt(['admin']));
    document.documentElement.dataset.theme = 'dark';
    const { unmount } = render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    expect(document.documentElement.dataset.theme).toBe('admin-dark');
    unmount();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('theme KHÔNG tồn tại lúc mount → unmount XÓA attribute (không bịa storefront)', async () => {
    stubFetch();
    authStore.setToken(fakeJwt(['admin']));
    delete document.documentElement.dataset.theme;
    const { unmount } = render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    expect(document.documentElement.dataset.theme).toBe('admin');
    unmount();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('active nav: /admin/orders/<id> → link Đơn hàng active; /admin/dashboard → link Tổng quan active', async () => {
    // order-detail query trả 404 → trang detail render nhánh not-found an toàn,
    // nav sidebar vẫn render đầy đủ (đủ để assert active-state).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/refresh')) return json({ accessToken: fakeJwt(['admin']) });
        return {
          ok: false,
          status: 404,
          headers: new Map() as unknown as Headers,
          json: async () => ({}),
          arrayBuffer: async () => new TextEncoder().encode('{}').buffer as ArrayBuffer
        } as unknown as Response;
      })
    );
    window.history.replaceState(null, '', '/admin/orders/0d9a2c5e-6b7f-4c1a-9e2d-3f4a5b6c7d8e');
    const view = render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    // order-detail map về Orders (activeNavIndex) — link nav phải active
    const ordersLink = screen.getByRole('link', { name: 'Đơn hàng' });
    expect(ordersLink.getAttribute('aria-current')).toBe('page');
    expect(ordersLink.className).toContain('admin-nav-link--active');
    view.unmount();

    // Dashboard path → link Tổng quan active (các link khác KHÔNG)
    stubFetch();
    window.history.replaceState(null, '', '/admin/dashboard');
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeTruthy();
    });
    const dashLink = screen.getByRole('link', { name: 'Tổng quan' });
    expect(dashLink.getAttribute('aria-current')).toBe('page');
    expect(dashLink.className).toContain('admin-nav-link--active');
    const ordersLinkAgain = screen.getByRole('link', { name: 'Đơn hàng' });
    expect(ordersLinkAgain.getAttribute('aria-current')).toBeNull();
    expect(ordersLinkAgain.className).not.toContain('admin-nav-link--active');
  });
});
