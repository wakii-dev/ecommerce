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

/** Fetch stub theo URL — đủ cho guard + Dashboard/Dashboard queries. */
function stubFetch(): void {
  const json = (body: unknown): Response =>
    ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]) as unknown as Headers,
      json: async () => body
    }) as unknown as Response;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) return json({ accessToken: fakeJwt(['admin']) });
      if (url.includes('/admin/products')) return json({ items: [], page: 1, size: 10, total: 0 });
      if (url.includes('/admin/categories')) return json([]);
      if (url.includes('/admin/low-stock')) return json([]);
      if (url.includes('/stats')) return json({});
      return json({});
    })
  );
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
      expect(screen.getByText('admin.guard.forbiddenTitle')).toBeTruthy();
    });
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
