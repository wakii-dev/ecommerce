import { expect, test } from '@playwright/test';
import { GATEWAY } from '../helpers/env';
import { authedFetch, registerNewUser } from '../helpers/api';

/**
 * §5.5 RBAC (SF-10): gateway từ chối không-token 401; customer token gọi
 * /api/admin/** → 403 SERVER-SIDE (authorization TRƯỚC route dispatch —
 * path chưa route vẫn 403, không 404). curl-equivalent qua fetch.
 */
test.describe('RBAC — gateway 401/403 (§5.5)', () => {
  test('không token → /api/admin/** 401', async () => {
    const res = await fetch(`${GATEWAY}/api/identity/admin/users`);
    expect(res.status).toBe(401);
  });

  test('không token → /api/ordering/admin/** 401', async () => {
    const res = await fetch(`${GATEWAY}/api/ordering/admin/orders`);
    expect(res.status).toBe(401);
  });

  test('customer token → /api/admin/** 403 (server-side, không phải 404)', async () => {
    const user = await registerNewUser('rbac');
    const res1 = await authedFetch('/api/identity/admin/users', user.accessToken);
    expect(res1.status).toBe(403);
    const res2 = await authedFetch('/api/ordering/admin/orders', user.accessToken);
    expect(res2.status).toBe(403);
    const res3 = await authedFetch('/api/catalog/admin/products', user.accessToken);
    expect(res3.status).toBe(403);
  });

  test('customer token → API của mình OK (me/orders 200 — không 403 oan)', async () => {
    const user = await registerNewUser('rbac-ok');
    const res = await authedFetch('/api/ordering/me/orders?page=1&size=5', user.accessToken);
    expect(res.status).toBe(200);
  });
});
