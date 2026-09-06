import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '../AuthStore';

const REFRESH_URL = '/api/identity/auth/refresh';

/** JWT giả (payload base64url, không cần chữ ký thật — client không verify). */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (s: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(s)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

beforeEach(() => {
  authStore.setToken(null);
  authStore.configureAuth({ refreshUrl: REFRESH_URL, fetchImpl: undefined });
});

describe('AuthStore — token & decode', () => {
  it('setToken decode payload → user {id, roles} (không verify chữ ký)', () => {
    authStore.setToken(
      makeJwt({ sub: 'user-1', roles: ['customer'], email: 'a@b.c', fullName: 'Nguyễn Văn A' })
    );
    expect(authStore.getToken()).toBeTruthy();
    expect(authStore.getUser()).toEqual({
      id: 'user-1',
      roles: ['customer'],
      email: 'a@b.c',
      fullName: 'Nguyễn Văn A'
    });
    expect(authStore.isAuthenticated()).toBe(true);
  });

  it('token sai format → user null, không crash', () => {
    authStore.setToken('khong-phai-jwt');
    expect(authStore.getUser()).toBeNull();
  });

  it('setToken(null) → clear token + user', () => {
    authStore.setToken(makeJwt({ sub: 'u1', roles: [] }));
    authStore.setToken(null);
    expect(authStore.getToken()).toBeNull();
    expect(authStore.getUser()).toBeNull();
    expect(authStore.isAuthenticated()).toBe(false);
  });

  it('token KHÔNG rơi vào localStorage', () => {
    const setItem = vi.fn();
    const getItem = vi.fn();
    const removeItem = vi.fn();
    Object.defineProperty(globalThis, 'localStorage', {
      value: { setItem, getItem, removeItem },
      configurable: true
    });
    try {
      authStore.setToken(makeJwt({ sub: 'u1', roles: ['customer'] }));
      authStore.logout();
      expect(setItem).not.toHaveBeenCalled();
      expect(getItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('AuthStore — hasRole', () => {
  it('admin + customer', () => {
    authStore.setToken(makeJwt({ sub: 'u1', roles: ['admin', 'customer'] }));
    expect(authStore.hasRole('admin')).toBe(true);
    expect(authStore.hasRole('customer')).toBe(true);
    expect(authStore.hasRole('admin', 'seller')).toBe(true); // any-of
    expect(authStore.hasRole('seller')).toBe(false);
    expect(authStore.hasRole()).toBe(false);
  });

  it('không đủ quyền / chưa đăng nhập', () => {
    authStore.setToken(makeJwt({ sub: 'u2', roles: ['customer'] }));
    expect(authStore.hasRole('admin')).toBe(false);
    authStore.setToken(null);
    expect(authStore.hasRole('customer')).toBe(false);
  });
});

describe('AuthStore — refresh & queue', () => {
  it('2 request 401 đồng thời → ĐÚNG 1 refresh call, cả 2 được retry với token mới', async () => {
    const jwt1 = makeJwt({ sub: 'u1', roles: ['customer'] });
    const jwt2 = makeJwt({ sub: 'u1', roles: ['customer'] });
    let refreshCalls = 0;
    let protectedCalls = 0;
    const authHeaders: string[] = [];

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (urlOf(input) === REFRESH_URL) {
        refreshCalls += 1;
        expect(init?.credentials).toBe('include');
        return jsonResponse({ accessToken: jwt2, expiresIn: 900 });
      }
      protectedCalls += 1;
      authHeaders.push(new Headers(init?.headers).get('Authorization') ?? '');
      if (protectedCalls <= 2) return jsonResponse({ title: 'unauthorized' }, 401);
      return jsonResponse({ ok: true });
    });

    authStore.setToken(jwt1);
    authStore.configureAuth({ fetchImpl });

    const [r1, r2] = await Promise.all([
      authStore.fetch('/protected'),
      authStore.fetch('/protected')
    ]);

    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(4); // 2 lần 401 + 2 retry
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(authHeaders[0]).toBe(`Bearer ${jwt1}`); // lần đầu token cũ
    expect(authHeaders[1]).toBe(`Bearer ${jwt1}`);
    expect(authHeaders[2]).toBe(`Bearer ${jwt2}`); // retry token mới
    expect(authHeaders[3]).toBe(`Bearer ${jwt2}`);
  });

  it('refresh 401 → logout + notify listeners, fetch trả 401 gốc', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> =>
      urlOf(input) === REFRESH_URL ? jsonResponse({}, 401) : jsonResponse({}, 401)
    );
    authStore.setToken(makeJwt({ sub: 'u1', roles: ['admin'] }));
    authStore.configureAuth({ fetchImpl });
    const listener = vi.fn();
    authStore.subscribe(listener);

    const res = await authStore.fetch('/protected');

    expect(res.status).toBe(401);
    expect(authStore.getToken()).toBeNull();
    expect(authStore.isAuthenticated()).toBe(false);
    expect(authStore.getUser()).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it('refresh thành công → token mới + notify', async () => {
    const jwt1 = makeJwt({ sub: 'u1', roles: ['customer'] });
    const jwt2 = makeJwt({ sub: 'u1', roles: ['customer'] });
    const fetchImpl = vi.fn(async (): Promise<Response> =>
      jsonResponse({ accessToken: jwt2, expiresIn: 900 })
    );
    authStore.setToken(jwt1);
    authStore.configureAuth({ fetchImpl });
    const listener = vi.fn();
    authStore.subscribe(listener);

    await expect(authStore.refresh()).resolves.toBe(true);
    expect(authStore.getToken()).toBe(jwt2);
    expect(listener).toHaveBeenCalled();
  });

  it('refresh lỗi mạng → logout, trả false', async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> => {
      throw new Error('network down');
    });
    authStore.setToken(makeJwt({ sub: 'u1', roles: [] }));
    authStore.configureAuth({ fetchImpl });

    await expect(authStore.refresh()).resolves.toBe(false);
    expect(authStore.isAuthenticated()).toBe(false);
  });
});

describe('AuthStore — subscribe/notify', () => {
  it('notify khi setToken/logout, unsubscribe ngừng nhận', () => {
    const listener = vi.fn();
    const unsubscribe = authStore.subscribe(listener);

    authStore.setToken(makeJwt({ sub: 'u1', roles: [] }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    authStore.logout();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
