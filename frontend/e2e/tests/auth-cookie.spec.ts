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

/**
 * FI-399 — session sync đa tab. 2 PAGES TRONG CÙNG 1 context (cookie jar +
 * storage + BroadcastChannel dùng chung). P1 pack: 2 contexts = partition riêng
 * → sync fail 100% như viết sai. Kịch bản: login A → B thấy ngay (≤1 POST
 * refresh, không reload); logout A → B out; 20-run rotate-race 0 spurious logout.
 */
test.describe('session sync — 2 pages cùng context (FI-399)', () => {
  let email: string;
  let password: string;

  test.beforeAll(async () => {
    const cred = newCredentials('sync399');
    email = cred.email;
    password = cred.password;
    // user cấp bằng API (pattern file này) — KHÔNG register qua UI
    const reg = await fetch(`${SHELL}/api/identity/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName: 'FI399 Sync' })
    });
    if (!reg.ok && reg.status !== 409) throw new Error(`register failed: ${reg.status}`);
  });

  /** Đếm POST refresh từ thời điểm attach (sau khi page boot xong). */
  function trackRefreshPosts(page: import('@playwright/test').Page): { count: (sinceMs?: number) => number; reset: () => void } {
    const times: number[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/identity/auth/refresh')) {
        times.push(Date.now());
      }
    });
    return {
      count: (sinceMs = 0) => times.filter((t) => t >= sinceMs).length,
      reset: () => {
        times.length = 0;
      }
    };
  }

  /**
   * Mở SHELL ở tab mới. Counter attach TRƯỚC navigation — boot POST của B
   * (initAccountShell → refresh, bootstrap.tsx:54) bay TRƯỚC khi auth-guest
   * visible; attach sau goto sẽ miss nó → poll(counter ≥ 1) chết vĩnh viễn.
   */
  async function openGuestPage(context: import('@playwright/test').BrowserContext) {
    const page = await context.newPage();
    const counter = trackRefreshPosts(page);
    await page.goto(`${SHELL}/`);
    await expect(page.getByTestId('auth-guest')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { sync399Loaded: boolean }).sync399Loaded = true;
    });
    return { page, counter };
  }

  /** Tab A cũng phải navigate tường minh (fixture `page` khởi đầu ở about:blank). */
  async function openMainPage(page: import('@playwright/test').Page) {
    await page.goto(`${SHELL}/`);
    await expect(page.getByTestId('auth-guest')).toBeVisible();
  }

  async function loginViaUi(page: import('@playwright/test').Page) {
    await page.getByTestId('auth-guest').getByRole('link', { name: 'Đăng nhập' }).click();
    await page.waitForURL(/\/login/);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByTestId('auth-user')).toBeVisible();
  }

  async function logoutViaUi(page: import('@playwright/test').Page) {
    await page.getByTestId('auth-user').click();
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
    await expect(page.getByTestId('auth-guest')).toBeVisible();
  }

  test('login A → B thấy user NGAY (không reload, ĐÚNG 1 POST refresh trên B)', async ({ page }) => {
    test.setTimeout(60_000);
    await openMainPage(page);
    const { page: b, counter: bCounter } = await openGuestPage(page.context());
    // Chờ boot-refresh của B (initAccountShell POST 1 lần) được counter quan
    // sát rồi RESET — bất biến với rig chậm (boot POST không tính vào t0).
    await expect
      .poll(() => bCounter.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    bCounter.reset();
    const t0 = Date.now();

    await loginViaUi(page);

    await expect(b.getByTestId('auth-user'), 'B nhận broadcast → refresh → header user').toBeVisible({ timeout: 15_000 });
    expect(await b.evaluate(() => (window as unknown as { sync399Loaded: boolean }).sync399Loaded), 'B KHÔNG reload (đóng dấu còn nguyên)').toBe(true);
    expect(bCounter.count(t0), 'B đúng ≤1 POST refresh cho event này (coordination serialize)').toBeLessThanOrEqual(1);
    await b.close();
  });

  test('logout A → B về guest NGAY (không reload)', async ({ page }) => {
    test.setTimeout(60_000);
    await openMainPage(page);
    const { page: b } = await openGuestPage(page.context());
    await loginViaUi(page);
    await expect(b.getByTestId('auth-user')).toBeVisible({ timeout: 15_000 });

    await logoutViaUi(page);

    await expect(b.getByTestId('auth-guest'), 'B nhận logout broadcast → refresh 401 → guest').toBeVisible({ timeout: 15_000 });
    expect(await b.evaluate(() => (window as unknown as { sync399Loaded: boolean }).sync399Loaded)).toBe(true);
    await b.close();
  });

  test('20-run rotate-race: 0 spurious logout (2 tab refresh đồng thời qua BC)', async ({ page }) => {
    test.setTimeout(180_000);
    await openMainPage(page);
    const { page: b } = await openGuestPage(page.context());
    await loginViaUi(page);
    await expect(b.getByTestId('auth-user')).toBeVisible({ timeout: 15_000 });

    // counter gắn SAU login — chỉ đếm POST của 20 vòng race (spec §5)
    const aCounter = trackRefreshPosts(page);
    const bCounter = trackRefreshPosts(b);
    const t0 = Date.now();

    for (let i = 0; i < 20; i++) {
      // BroadcastChannel NGOÀI app cùng channel → CẢ 2 page (dữ listener của
      // app) refresh đồng thời — đúng race one-time-rotate thật.
      await page.evaluate(() => {
        const ch = new BroadcastChannel('ecommerce.auth');
        ch.postMessage({ type: 'auth-changed' });
        setTimeout(() => ch.close(), 50);
      });
      await expect(page.getByTestId('auth-user'), `run ${i}: A không logout`).toBeVisible();
      await expect(b.getByTestId('auth-user'), `run ${i}: B không logout`).toBeVisible();
      await page.waitForTimeout(150); // nhường 2 page kịp xong refresh serialized
    }

    const total = aCounter.count(t0) + bCounter.count(t0);
    expect(total, 'tổng POST refresh 20 vòng ≤ 50 (2×20 + slack 10) — vượt = coordination hỏng').toBeLessThanOrEqual(50);
    await expect(page.getByTestId('auth-user')).toBeVisible();
    await expect(b.getByTestId('auth-user')).toBeVisible();
    await b.close();
  });
});
