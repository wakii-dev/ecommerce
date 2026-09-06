import { describe, expect, it } from 'vitest';
import { ApiErrorClient, createIdentityClient, type IdentityClient } from '../index';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

function mockFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
  const calls: RecordedCall[] = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  };
  return { calls, fetchMock };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const headersOf = (call: RecordedCall | undefined): Record<string, string> =>
  (call?.init?.headers as Record<string, string> | undefined) ?? {};

describe('createIdentityClient (smoke — mock fetchImpl)', () => {
  it('login — URL + method + JSON body đúng, X-Request-Id sinh trong request', async () => {
    const { calls, fetchMock } = mockFetch(() =>
      jsonResponse(200, {
        accessToken: 'at',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: 'u1', email: 'a@b.c', fullName: 'A B', roles: ['CUSTOMER'] },
      }),
    );
    const client = createIdentityClient({ baseURL: 'http://svc.test/', fetchImpl: fetchMock });
    await client.login({ email: 'a@b.c', password: 'secret' });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('http://svc.test/api/identity/auth/login');
    expect(call?.init?.method).toBe('POST');
    expect(headersOf(call)['Content-Type']).toBe('application/json');
    expect(headersOf(call)['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headersOf(call)['Authorization']).toBeUndefined();
    expect(JSON.parse(String(call?.init?.body))).toEqual({ email: 'a@b.c', password: 'secret' });
  });

  it('type-level — args + response của login typed theo schema (typecheck qua tsc --noEmit)', async () => {
    type LoginArgs = Parameters<IdentityClient['login']>[0];
    const args: LoginArgs = { email: 'a@b.c', password: 'secret' };

    const { calls, fetchMock } = mockFetch(() =>
      jsonResponse(200, { twoFactorRequired: true, challengeToken: 'ct' }),
    );
    const client = createIdentityClient({ baseURL: 'http://svc.test', fetchImpl: fetchMock });
    const result = await client.login(args);
    expect(calls).toHaveLength(1);
    // response là union theo spec: LoginSuccess | TwoFactorChallenge — discriminate được
    if ('twoFactorRequired' in (result as object)) {
      expect((result as { challengeToken: string }).challengeToken).toBe('ct');
    }
  });

  it('Authorization Bearer tự gắn khi getToken trả token; không gắn khi null', async () => {
    const { calls, fetchMock } = mockFetch(() => jsonResponse(200, { id: 'u1' }));
    let token: string | null = 'tok-123';
    const client = createIdentityClient({
      baseURL: 'http://svc.test',
      fetchImpl: fetchMock,
      getToken: () => token,
    });
    await client.getMe({});
    expect(headersOf(calls[0])['Authorization']).toBe('Bearer tok-123');

    token = null;
    await client.getMe({});
    expect(headersOf(calls[1])['Authorization']).toBeUndefined();
  });

  it('path params substitute + query serialize', async () => {
    const { calls, fetchMock } = mockFetch(() => jsonResponse(200, { keys: [] }));
    const client = createIdentityClient({ baseURL: 'http://svc.test', fetchImpl: fetchMock });
    await client.oauthAuthorize({ provider: 'google' });
    await client.adminListUsers({ page: 2, size: 20, q: 'duy an' });

    expect(calls[0]?.url).toBe('http://svc.test/api/identity/oauth/google/authorize');
    const second = new URL(calls[1]?.url ?? 'about:blank');
    expect(second.pathname).toBe('/api/identity/admin/users');
    expect(second.searchParams.get('page')).toBe('2');
    expect(second.searchParams.get('size')).toBe('20');
    expect(second.searchParams.get('q')).toBe('duy an');
  });

  it('error problem+json → ApiErrorClient với fields mirror ApiError', async () => {
    const { fetchMock } = mockFetch(() =>
      jsonResponse(409, {
        type: 'https://ecommerce.example/errors/cart-item-out-of-stock',
        title: 'Conflict',
        status: 409,
        detail: 'Variant het hang',
        instance: '/api/cart/items',
        timestamp: '2026-09-06T10:00:00Z',
        requestId: 'req-1',
        errors: [{ field: 'variantId', message: 'het hang' }],
      }),
    );
    const client = createIdentityClient({ baseURL: 'http://svc.test', fetchImpl: fetchMock });

    try {
      await client.login({ email: 'a@b.c', password: 'x' });
      expect.unreachable('phải throw ApiErrorClient');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiErrorClient);
      const err = error as ApiErrorClient;
      expect(err.name).toBe('ApiErrorClient');
      expect(err.status).toBe(409);
      expect(err.type).toBe('https://ecommerce.example/errors/cart-item-out-of-stock');
      expect(err.title).toBe('Conflict');
      expect(err.detail).toBe('Variant het hang');
      expect(err.instance).toBe('/api/cart/items');
      expect(err.timestamp).toBe('2026-09-06T10:00:00Z');
      expect(err.requestId).toBe('req-1');
      expect(err.errors).toEqual([{ field: 'variantId', message: 'het hang' }]);
      expect(err.message).toBe('Variant het hang');
    }
  });

  it('204 → undefined (không parse body)', async () => {
    const { calls, fetchMock } = mockFetch(() => new Response(null, { status: 204 }));
    const client = createIdentityClient({ baseURL: 'http://svc.test', fetchImpl: fetchMock });
    const result = await client.logout({});
    expect(result).toBeUndefined();
    expect(calls[0]?.init?.body).toBeUndefined();
  });
});
