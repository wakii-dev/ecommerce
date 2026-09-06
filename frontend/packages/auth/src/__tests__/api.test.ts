import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authStore, configureAuth } from '../AuthStore';
import { login, register, logout, updateProfile, fetchProfile } from '../api';

// Stub fetch: queue responses theo thứ tự gọi.
function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('stubFetch hết response');
    return new Response(next.status === 204 ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  return { calls, impl };
}

const okJwt = `header.${btoa(JSON.stringify({ sub: 'u-1', role: 'CUSTOMER', roles: ['CUSTOMER'], email: 'a@x.com', fullName: 'A' })).replace(/=+$/, '')}.sig`;

describe('auth api', () => {
  beforeEach(() =>
    configureAuth({ refreshUrl: '/api/identity/auth/refresh', identityBaseUrl: '', fetchImpl: undefined })
  );
  afterEach(() => authStore.logout());

  it('login set token + user từ claim', async () => {
    const { impl } = stubFetch([{ status: 200, body: { accessToken: okJwt, tokenType: 'Bearer', expiresIn: 900, user: {} } }]);
    configureAuth({ fetchImpl: impl });
    const user = await login({ email: 'a@x.com', password: 'password123' });
    expect(user.id).toBe('u-1');
    expect(user.roles).toEqual(['CUSTOMER']);
    expect(authStore.isAuthenticated()).toBe(true);
  });

  it('register auto-login (register 201 rồi login)', async () => {
    const { impl, calls } = stubFetch([
      { status: 201, body: { id: 'u-1', email: 'a@x.com', fullName: 'A', roles: ['CUSTOMER'] } },
      { status: 200, body: { accessToken: okJwt, tokenType: 'Bearer', expiresIn: 900, user: {} } }
    ]);
    configureAuth({ fetchImpl: impl });
    await register({ email: 'a@x.com', password: 'password123', fullName: 'A' });
    expect(calls[0]?.url).toContain('/api/identity/auth/register');
    expect(calls[1]?.url).toContain('/api/identity/auth/login');
    expect(authStore.isAuthenticated()).toBe(true);
  });

  it('401 → refresh đúng 1 lần → retry request', async () => {
    const { impl, calls } = stubFetch([
      { status: 401, body: { title: 'Unauthorized' } },          // PATCH /me lần đầu
      { status: 200, body: { accessToken: okJwt, expiresIn: 900 } }, // refresh
      { status: 200, body: { id: 'u-1', email: 'a@x.com', fullName: 'A2', roles: [], twoFactorEnabled: false } } // retry
    ]);
    configureAuth({ fetchImpl: impl });
    const me = await updateProfile({ fullName: 'A2' });
    expect(me.fullName).toBe('A2');
    const urls = calls.map((c) => c.url);
    expect(urls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith('/api/identity/me'))).toHaveLength(2);
  });

  it('fetchProfile 401 → refresh đúng 1 lần → retry GET /me', async () => {
    const { impl, calls } = stubFetch([
      { status: 401, body: { title: 'Unauthorized' } },          // GET /me lần đầu
      { status: 200, body: { accessToken: okJwt, expiresIn: 900 } }, // refresh
      { status: 200, body: { id: 'u-1', email: 'a@x.com', fullName: 'A', roles: ['CUSTOMER'], twoFactorEnabled: false } } // retry
    ]);
    configureAuth({ fetchImpl: impl });
    const me = await fetchProfile();
    expect(me.email).toBe('a@x.com');
    const urls = calls.map((c) => c.url);
    expect(urls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith('/api/identity/me'))).toHaveLength(2);
  });

  it('logout clear state kể cả API fail', async () => {
    const { impl } = stubFetch([{ status: 401, body: { title: 'Unauthorized' } }]);
    configureAuth({ fetchImpl: impl });
    authStore.setToken(okJwt);
    await logout();
    expect(authStore.isAuthenticated()).toBe(false);
  });

  it('ApiErrorClient mang field errors', async () => {
    const { impl } = stubFetch([{ status: 409, body: { title: 'Conflict', detail: 'Email đã tồn tại', status: 409 } }]);
    configureAuth({ fetchImpl: impl });
    await expect(login({ email: 'dup@x.com', password: 'password123' })).rejects.toMatchObject({
      name: 'ApiErrorClient',
      status: 409
    });
  });
});
