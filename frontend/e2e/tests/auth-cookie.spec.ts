import { expect, test } from '@playwright/test';
import { SHELL } from '../helpers/env';
import { newCredentials } from '../helpers/api';


/**
 * FI-337 residual (FI-366 SF-1 T8) — REGRESSION LOCK: Set-Cookie xuyên vite
 * proxy. FI-337 #2 report "vite proxy nuốt Set-Cookie khi register/login"
 * KHÔNG tái hiện trên code GA (repro 08-09: login/refresh/logout round-trip
 * qua :5173 + :5176 nguyên vẹn; register 201 không Set-Cookie ở cả direct —
 * register ≠ auto-login by design). Spec này khoá hành vi đó: nếu ai thêm
 * proxy config nuốt Set-Cookie, test fail trước khi tới user.
 *
 * Assert ở TẦNG HTTP qua playwright request (vite proxy là layer dev-only;
 * browser fetch cùng origin đi cùng path /api/identity → cùng proxy).
 */
test.describe.configure({ mode: 'serial' });

const COOKIE_ATTRS = /refresh_token=[^;]+; Path=\/api\/identity[^;]*; .*HttpOnly; SameSite=Lax/i;

for (const origin of [SHELL]) {
  test.describe(`auth cookie qua vite proxy ${origin}`, () => {
    let email: string;
    let password: string;

    test.beforeAll(async () => {
      const cred = await newCredentials('cookie337');
      email = cred.email;
      password = cred.password;
    });

    test('register 201 — KHÔNG Set-Cookie (register ≠ auto-login, by design)', async ({ request }) => {
      const res = await request.post(`${origin}/api/identity/auth/register`, {
        data: { email, password, fullName: 'FI337 Cookie Lock' }
      });
      expect(res.status()).toBe(201);
      const setCookie = res.headers()['set-cookie'];
      expect(setCookie, 'register không cấp refresh cookie — AuthStore phải login sau register').toBeUndefined();
    });

    test('login xuyên proxy → Set-Cookie refresh_token nguyên vẹn (HttpOnly, SameSite=Lax, Path=/api/identity)', async ({ request }) => {
      const res = await request.post(`${origin}/api/identity/auth/login`, {
        data: { email, password }
      });
      expect(res.status()).toBe(200);
      const setCookie = res.headers()['set-cookie'];
      expect(setCookie, 'vite proxy PHẢI truyền Set-Cookie (FI-337)').toBeDefined();
      expect(setCookie).toMatch(COOKIE_ATTRS);
    });

    test('refresh round-trip xuyên proxy → cookie rotate + token cũ revoke', async ({ request }) => {
      const login = await request.post(`${origin}/api/identity/auth/login`, {
        data: { email, password }
      });
      const cookieHeader = login.headers()['set-cookie']!;
      const raw = /refresh_token=([^;]+)/.exec(cookieHeader)![1];

      const refresh = await request.post(`${origin}/api/identity/auth/refresh`, {
        headers: { cookie: `refresh_token=${raw}` }
      });
      expect(refresh.status()).toBe(200);
      const rotated = refresh.headers()['set-cookie']!;
      expect(rotated).toMatch(COOKIE_ATTRS);
      const newRaw = /refresh_token=([^;]+)/.exec(rotated)![1];
      expect(newRaw, 'rotation PHẢI cấp token mới (one-time rotate)').not.toBe(raw);

      // token cũ đã revoke → refresh lại bằng token cũ = 401 (atomic rotate)
      const replay = await request.post(`${origin}/api/identity/auth/refresh`, {
        headers: { cookie: `refresh_token=${raw}` }
      });
      expect(replay.status(), 'replay token cũ phải 401 — revokeIfActive').toBe(401);
    });

    test('logout xuyên proxy → 204 + cookie cleared (max-age=0)', async ({ request }) => {
      const login = await request.post(`${origin}/api/identity/auth/login`, {
        data: { email, password }
      });
      const raw = /refresh_token=([^;]+)/.exec(login.headers()['set-cookie']!)![1];
      const logout = await request.post(`${origin}/api/identity/auth/logout`, {
        headers: { cookie: `refresh_token=${raw}` }
      });
      expect(logout.status()).toBe(204);
      const cleared = logout.headers()['set-cookie']!;
      expect(cleared).toMatch(/refresh_token=;?.*Max-Age=0/i);
    });
  });
}
