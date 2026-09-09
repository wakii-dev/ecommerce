import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { SHELL, STOREFRONT } from '../helpers/env';

/**
 * SF-5 (FI-402) — sync matrix × 2 app: tab A = STOREFRONT `/` (Next host),
 * tab B = SHELL `/cart` (Vite host) — CÙNG Playwright context (cookie jar +
 * storage + BroadcastChannel dùng chung, origin-scoped) và CÙNG origin qua
 * entry (dev :3400 Next rewrites / ISOLATED :8480 gateway 1-origin).
 *
 * Pattern FI-399 (auth-cookie.spec): `trackRefreshPosts` attach TRƯỚC
 * navigation (boot POST của B bay trước khi auth-guest visible — attach sau
 * goto sẽ miss); đóng dấu `syncLoaded` trên window để assert KHÔNG reload.
 *
 * Khác FI-399: 2 tab KHÁC app (chứng minh sync xuyên runtime Next↔Vite),
 * thêm 2FA challenge (setup→enable→login→challenge KHÔNG broadcast→verify→
 * broadcast), OAuth callback error-path, và rotate-race cross-app.
 *
 * API register/login/2fa-setup đi qua `${STOREFRONT}/api/identity/**` —
 * cùng đường entry như browser (rig A: Next proxy → gateway; rig B: gateway
 * trực tiếp) — kiếm chứng thêm seam proxy của entry.
 *
 * VIDEO: `test.use({ video: 'on' })` — sync demo là deliverable bắt buộc
 * (ACCEPTANCE 1). File rơi vào test-results/<slug>/video.webm; runner copy
 * các video login/logout/2FA sang `.run/sf5-sync-video/` sau khi xanh.
 */
test.use({ video: 'on' });

// ── TOTP (RFC 6238) — node:crypto + base32 decode tự viết, KHÔNG thêm dep ──

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648, alphabet A-Z2-7) → bytes — secret 2FA của identity. */
function base32Decode(input: string): Buffer {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of input.replace(/=+$/, '').toUpperCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Mã TOTP 6 số HMAC-SHA1 step 30s tại `atMs` (+`stepOffset` bước — dùng để
 * retry biên 30s). Backend TwoFactorService chấp nhận ±1 bước nên lệch nhỏ
 * vẫn sống; offset dùng khi enable 401/400 lần đầu.
 */
function totpCode(secretBase32: string, atMs = Date.now(), stepOffset = 0): string {
  const counter = Math.floor(atMs / 30_000) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

// ── API helpers — qua entry origin (cùng đường browser) ────────────────────

async function apiRegister(origin: string, email: string, password: string): Promise<void> {
  const res = await fetch(`${origin}/api/identity/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName: 'SF5 Sync Matrix' })
  });
  // 409 = đã tồn tại (retry của Playwright dùng lại user) — chấp nhận.
  if (!res.ok && res.status !== 409) throw new Error(`register ${email} → ${res.status}`);
}

async function apiLogin(origin: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${origin}/api/identity/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

/** Bật 2FA cho user: setup → TOTP (retry bước kế nếu code biên 30s lệch). */
async function apiEnable2fa(
  origin: string,
  token: string
): Promise<{ secret: string; otpauthUrl: string }> {
  const setupRes = await fetch(`${origin}/api/identity/2fa/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}'
  });
  if (!setupRes.ok) throw new Error(`2fa/setup → ${setupRes.status}: ${await setupRes.text()}`);
  const { secret, otpauthUrl } = (await setupRes.json()) as { secret: string; otpauthUrl: string };
  expect(secret, 'setup trả secret base32').toMatch(/^[A-Z2-7]+={0,6}$/i);
  expect(otpauthUrl).toContain('otpauth://totp');

  for (const stepOffset of [0, 1]) {
    const enableRes = await fetch(`${origin}/api/identity/2fa/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: totpCode(secret, Date.now(), stepOffset) })
    });
    if (enableRes.ok) return { secret, otpauthUrl };
    // 400/401 = mã sai — sinh lại code bước 30s kế rồi thử lần 2.
    if (stepOffset === 0 && (enableRes.status === 400 || enableRes.status === 401)) continue;
    throw new Error(`2fa/enable → ${enableRes.status}: ${await enableRes.text()}`);
  }
  throw new Error('2fa/enable: không thể xác thực bằng mã TOTP nào');
}

// ── Page helpers (pattern auth-cookie.spec FI-399) ─────────────────────────

type RefreshCounter = { count: (sinceMs?: number) => number; reset: () => void };

/** Đếm POST refresh từ thời điểm attach (phải attach TRƯỚC navigation). */
function trackRefreshPosts(page: import('@playwright/test').Page): RefreshCounter {
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

const stampKey = 'sf5SyncLoaded';

/**
 * Tab B — SHELL `/cart` (app KHÁC tab A). Counter attach TRƯỚC goto; đóng
 * dấu `syncLoaded` sau khi boot ổn định để assert KHÔNG reload sau này.
 */
async function openShellCartGuest(context: import('@playwright/test').BrowserContext) {
  const page = await context.newPage();
  const counter = trackRefreshPosts(page);
  await page.goto(`${SHELL}/cart`);
  await expect(page.getByTestId('auth-guest')).toBeVisible();
  // Chờ boot-refresh của shell (initAccountShell POST 1 lần) lọt vào counter
  // rồi RESET — boot POST không được tính vào các mốc t0 của từng case.
  await expect.poll(() => counter.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  counter.reset();
  await page.evaluate((key) => {
    (window as unknown as Record<string, boolean>)[key] = true;
  }, stampKey);
  return { page, counter };
}

/** Đóng dấu trên trang hiện có (dùng cho tab A trước một kịch bản nào đó). */
async function stampSyncLoaded(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate((key) => {
    (window as unknown as Record<string, boolean>)[key] = true;
  }, stampKey);
}

function syncStamp(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate((key) => Boolean((window as unknown as Record<string, boolean>)[key]), stampKey);
}

/** Tab A mở STOREFRONT home (guest). */
async function openStorefrontGuest(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${STOREFRONT}/`);
  // Storefront host KHÔNG render AuthMenu chrome (SF-4 ChromeShell giữ header
  // actions riêng: locale/theme/cart/account) — auth-guest/user testid CHỈ tồn
  // tại trên shell host. Login entry từ A = account link → shell /account.
  await expect(page.locator('.header-actions a[href="/account"]')).toBeVisible();
}

/**
 * Login qua UI từ A: storefront account link → /account (shell) → auth-guest →
 * Đăng nhập → /login → submit. Landing KHÁC nhau theo user (auth-user thường /
 * /login/2fa khi bật 2FA) — caller tự assert phần cuối.
 */
async function loginViaUi(page: import('@playwright/test').Page, email: string, password: string): Promise<void> {
  await page.locator('.header-actions a[href="/account"]').click();
  await page.waitForURL(/\/account/);
  await expect(page.getByTestId('auth-guest')).toBeVisible();
  await page.getByTestId('auth-guest').getByRole('link', { name: 'Đăng nhập' }).click();
  await page.waitForURL(/\/login/);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  // scope vào FORM login — nút Tìm kiếm của header cũng type=submit
  await page.locator('form:has(input[type="email"]) button[type="submit"]').click();
}

async function logoutViaUi(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('auth-user').click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  await expect(page.getByTestId('auth-guest')).toBeVisible();
}

// ── Cases ───────────────────────────────────────────────────────────────────

const PASSWORD = 'E2e#2026demo';

/** User MỚI per-test (không beforeAll chia sẻ): 2FA test ĐỔI state user —
 *  user chung sẽ nhiễm 2FA sang case kế (flake thật: retry rơi challenge). */
async function newUser(prefix: string): Promise<{ email: string; password: string }> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.demo.vn`;
  await apiRegister(STOREFRONT, email, PASSWORD);
  return { email, password: PASSWORD };
}

test.describe('SF-5 sync matrix × 2 app (FI-402)', () => {

  test('login A (storefront) → B (shell /cart) thấy user NGAY — ≤1 POST refresh, không reload', async ({ page }) => {
    test.setTimeout(120_000);
    const user = await newUser('sf5in');
    await openStorefrontGuest(page);
    const { page: b, counter: bCounter } = await openShellCartGuest(page.context());
    const t0 = Date.now();

    await loginViaUi(page, user.email, user.password);
    await expect(page.getByTestId('auth-user')).toBeVisible();

    await expect(b.getByTestId('auth-user'), 'B nhận broadcast xuyên app → header user').toBeVisible({
      timeout: 15_000
    });
    expect(await syncStamp(b), 'B KHÔNG reload (đóng dấu còn nguyên)').toBe(true);
    expect(bCounter.count(t0), 'B ≤1 POST refresh cho event (coordination serialize)').toBeLessThanOrEqual(1);
    await b.close();
  });

  test('logout A → B (shell /cart) về guest NGAY — không reload', async ({ page }) => {
    test.setTimeout(120_000);
    const user = await newUser('sf5out');
    await openStorefrontGuest(page);
    const { page: b, counter: bCounter } = await openShellCartGuest(page.context());
    await loginViaUi(page, user.email, user.password);
    await expect(page.getByTestId('auth-user')).toBeVisible();
    await expect(b.getByTestId('auth-user')).toBeVisible({ timeout: 15_000 });
    bCounter.reset();
    const t0 = Date.now();

    await logoutViaUi(page);

    await expect(b.getByTestId('auth-guest'), 'B nhận logout broadcast → guest').toBeVisible({
      timeout: 15_000
    });
    expect(await syncStamp(b), 'B KHÔNG reload').toBe(true);
    expect(bCounter.count(t0), 'logout không kéo B refresh lặp (≤1 — 401 lần đầu)').toBeLessThanOrEqual(1);
    await b.close();
  });

  test('2FA: login → challenge /login/2fa KHÔNG broadcast (B guest, 0 POST) → verify → B thấy user', async ({ page }) => {
    test.setTimeout(180_000);
    // User RIÊNG cho 2FA (bật 2FA là state server không rollback trong test).
    const user = await newUser('sf52fa');
    // Bật 2FA (API): setup → TOTP → enable (retry bước kế nếu biên 30s lệch).
    const token = await apiLogin(STOREFRONT, user.email, user.password);
    const { secret } = await apiEnable2fa(STOREFRONT, token);

    await openStorefrontGuest(page);
    const { page: b, counter: bCounter } = await openShellCartGuest(page.context());
    bCounter.reset();
    const t0 = Date.now();

    // Login → server trả challenge → trang /login/2fa (KHÔNG set token).
    await loginViaUi(page, user.email, user.password);
    await page.waitForURL(/\/login\/2fa/);
    await expect(page.locator('input[name="code"]'), 'trang challenge hiện ô nhập mã').toBeVisible();

    // Challenge CHƯA set token → KHÔNG được broadcast: B vẫn guest, 0 POST.
    expect(bCounter.count(t0), 'challenge KHÔNG broadcast — B 0 POST refresh').toBe(0);
    await expect(b.getByTestId('auth-guest'), 'B vẫn guest trong lúc challenge').toBeVisible();

    // Hoàn tất challenge bằng TOTP (nếu biên 30s lệch → window kế).
    for (const stepOffset of [0, 1]) {
      await page.locator('input[name="code"]').fill(totpCode(secret, Date.now(), stepOffset));
      await page.getByRole('button', { name: 'Xác nhận' }).click();
      try {
        await expect(page.getByTestId('auth-user')).toBeVisible({ timeout: 10_000 });
        break;
      } catch {
        if (stepOffset === 1) throw new Error('verify TOTP fail cả 2 window');
      }
    }

    // Token đã set → broadcast BAY: B thấy user, không reload, ≤1 POST.
    await expect(b.getByTestId('auth-user'), 'verify xong → broadcast → B thấy user').toBeVisible({
      timeout: 15_000
    });
    expect(await syncStamp(b), 'B KHÔNG reload').toBe(true);
    expect(bCounter.count(t0), 'B ≤1 POST refresh cho event verify').toBeLessThanOrEqual(1);
    await b.close();
  });

  test('OAuth callback error-path: render lỗi không crash — B vẫn guest', async ({ page }) => {
    test.setTimeout(120_000);
    await openStorefrontGuest(page);
    const { page: b } = await openShellCartGuest(page.context());

    // Callback lỗi từ provider (identity 302 ?error=access_denied, sanitize
    // [a-zA-Z0-9_-] → i18n key). Mở trên A cùng origin entry.
    await page.goto(`${SHELL}/login/oauth/callback?error=access_denied`);
    await expect(page.getByRole('alert')).toHaveText('Bạn đã từ chối cấp quyền đăng nhập.');
    await expect(page.getByRole('heading', { name: 'Đăng nhập không thành công' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Về trang đăng nhập' })).toBeVisible();

    // Không corrupt state: B (app khác, cùng context) vẫn guest nguyên vẹn.
    await expect(b.getByTestId('auth-guest')).toBeVisible();
    await b.close();
  });

  test('20-run rotate-race cross-app: 0 spurious logout, tổng POST ≤ 50', async ({ page }) => {
    test.setTimeout(240_000);
    const user = await newUser('sf5race');
    await openStorefrontGuest(page);
    const { page: b } = await openShellCartGuest(page.context());
    await loginViaUi(page, user.email, user.password);
    await expect(page.getByTestId('auth-user')).toBeVisible();
    await expect(b.getByTestId('auth-user')).toBeVisible({ timeout: 15_000 });

    await stampSyncLoaded(page);
    await stampSyncLoaded(b);
    // counter gắn SAU login — chỉ đếm POST của 20 vòng race.
    const aCounter = trackRefreshPosts(page);
    const bCounter = trackRefreshPosts(b);
    const t0 = Date.now();

    for (let i = 0; i < 20; i++) {
      // BroadcastChannel NGOÀI app cùng channel → CẢ 2 page (A storefront +
      // B shell — khác runtime, cùng origin) refresh đồng thời.
      await page.evaluate(() => {
        const ch = new BroadcastChannel('ecommerce.auth');
        ch.postMessage({ type: 'auth-changed' });
        setTimeout(() => ch.close(), 50);
      });
      await expect(page.getByTestId('auth-user'), `run ${i}: A không logout`).toBeVisible();
      await expect(b.getByTestId('auth-user'), `run ${i}: B không logout`).toBeVisible();
      await page.waitForTimeout(150); // nhường 2 page xong refresh serialized
    }

    const total = aCounter.count(t0) + bCounter.count(t0);
    expect(total, 'tổng POST refresh 20 vòng ≤ 50 (2×20 + slack 10)').toBeLessThanOrEqual(50);
    expect(await syncStamp(page), 'A không reload suốt race').toBe(true);
    expect(await syncStamp(b), 'B không reload suốt race').toBe(true);
    await expect(page.getByTestId('auth-user')).toBeVisible();
    await expect(b.getByTestId('auth-user')).toBeVisible();
    await b.close();
  });
});
