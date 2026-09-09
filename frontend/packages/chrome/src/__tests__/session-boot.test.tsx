import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Session boot tests (FI-398 T10, spec §5.8): 2 lần gọi → ĐÚNG 1 refresh
 * (cùng promise object) + configureAuth first-call-wins. ensureSession là
 * module-level singleton — mỗi case vi.resetModules() + dynamic import để
 * reset state. LƯU Ý: resetModules KHÔNG đụng mock registry (spy giữ nguyên
 * và cộng dồn call history) → vi.clearAllMocks() trước mỗi case (giữ
 * implementation, xoá call count).
 */
vi.mock('@ecommerce/auth', () => ({
  configureAuth: vi.fn(),
  authStore: { refresh: vi.fn(() => Promise.resolve(true)) }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function fresh() {
  vi.resetModules();
  const mod = await import('../session-boot');
  const auth = await import('@ecommerce/auth');
  return { mod, auth };
}

describe('ensureSession single-flight', () => {
  it('2 lần gọi → refresh ĐÚNG 1 lần, cả 2 promise cùng object', async () => {
    const { mod, auth } = await fresh();
    const p1 = mod.ensureSession();
    const p2 = mod.ensureSession();
    await Promise.all([p1, p2]);
    expect(auth.authStore.refresh).toHaveBeenCalledTimes(1);
    expect(p1).toBe(p2);
    await expect(p1).resolves.toBe(true);
  });

  it('first-call-wins: loginPath /account trước rồi /login → configureAuth ĐÚNG 1 lần với /account', async () => {
    const { mod, auth } = await fresh();
    await mod.ensureSession({ loginPath: '/account' });
    await mod.ensureSession({ loginPath: '/login' });
    expect(auth.configureAuth).toHaveBeenCalledTimes(1);
    expect(auth.configureAuth).toHaveBeenCalledWith({
      refreshUrl: '/api/identity/auth/refresh',
      identityBaseUrl: '',
      loginPath: '/account'
    });
  });

  it('không truyền options → default loginPath /login', async () => {
    const { mod, auth } = await fresh();
    await mod.ensureSession();
    expect(auth.configureAuth).toHaveBeenCalledWith({
      refreshUrl: '/api/identity/auth/refresh',
      identityBaseUrl: '',
      loginPath: '/login'
    });
  });
});

describe('SessionBootProvider', () => {
  it('mount → ensureSession chạy 1 lần, render children NGAY (không gate)', async () => {
    const { mod, auth } = await fresh();
    render(<mod.SessionBootProvider><p data-testid="boot-child">content</p></mod.SessionBootProvider>);
    expect(screen.getByTestId('boot-child')).toBeTruthy();
    await vi.waitFor(() => {
      expect(auth.authStore.refresh).toHaveBeenCalledTimes(1);
    });
  });
});
