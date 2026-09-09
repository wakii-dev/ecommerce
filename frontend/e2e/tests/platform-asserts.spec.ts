import { expect, test } from '@playwright/test';
import { GATEWAY, STOREFRONT, env, hasStripe } from '../helpers/env';
import { mongoEventLogCount } from '../helpers/api';

/**
 * PLATFORM ASSERTS (SF-10): §5.8 event_log · §5.9 ES · §5.10 SEO
 * (sitemap/robots — PDP view-source ở golden-path test 2) · §5.11 i18n ·
 * §5.13 partner API · §5.14 affiliate.
 *
 * Affiliate commission (order.confirmed → ledger) [PENDING-STRIPE-KEYS] —
 * cần đơn CONFIRMED thật; click-tracking + landing assert green không keys.
 */
const PENDING = '[PENDING-STRIPE-KEYS]';
const STRIPE_READY = hasStripe();
const PARTNER_KEY = 'pk_0123456789abcdef0123456789abcdef'; // seed.sh determinstic

test('§5.8 Mongo event_log có documents cho domain events của demo', async () => {
  await expect
    .poll(async () => mongoEventLogCount(), { timeout: 30_000, intervals: [3_000] })
    .toBeGreaterThan(0);
  // user.created phát ở register (golden-path chạy TRƯỚC platform-asserts —
  // alphabetical file order). product.changed chỉ khi admin CRUD — assert ở
  // admin-crud spec (storefront thấy = product.changed đã qua ES).
  expect(await mongoEventLogCount('user.created')).toBeGreaterThan(0);
});

test('§5.9 ES products index count > 0 + search endpoint trả kết quả', async () => {
  // FI-402: ES URL env-driven — rig isolate +400 dùng :9600 (E2E_ES_URL),
  // mặc định giữ :9200 (stack chính) cho backward-compat.
  const esUrl = process.env.E2E_ES_URL || 'http://localhost:9200';
  const esRes = await fetch(`${esUrl}/products/_count`);
  expect(esRes.status).toBe(200);
  const esBody = (await esRes.json()) as { count: number };
  expect(esBody.count).toBeGreaterThan(0);

  const search = await page_requestSearch('Tai nghe');
  expect(search).toBeGreaterThan(0);
});

async function page_requestSearch(q: string): Promise<number> {
  const res = await fetch(`${GATEWAY}/api/catalog/search?q=${encodeURIComponent(q)}&locale=vi`);
  if (!res.ok) return 0;
  const body = (await res.json()) as { total?: number; items?: unknown[] };
  return body.total ?? body.items?.length ?? 0;
}

test('§5.10 sitemap.xml + robots.txt 200 với URL products', async ({ request }) => {
  const sitemap = await request.get(`${STOREFRONT}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('/p/');

  const robots = await request.get(`${STOREFRONT}/robots.txt`);
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap');
});

test('§5.11 i18n: /en/p/<slug-en> nội dung tiếng Anh + hreflang + search ?locale=en', async ({ request }) => {
  // slug-en từ seed SF-4 (bilingual) — search en rồi mở PDP en
  const searchEn = await request.get(`${GATEWAY}/api/catalog/search?q=tai+nghe&locale=en`);
  const body = (await searchEn.json()) as { items?: { slugEn?: string; slug?: string }[] };
  const items = body.items ?? [];
  test.skip(items.length === 0, 'cần seed bilingual — chạy make seed + catalog boot');
  const slugEn = items[0]?.slugEn ?? items[0]?.slug ?? '';
  expect(slugEn).not.toBe('');

  const pdp = await request.get(`${STOREFRONT}/en/p/${slugEn}`);
  expect(pdp.status()).toBe(200);
  const html = (await pdp.text()).toLowerCase();
  expect(html).toContain('hreflang'); // alternate links
  expect(html).toContain('add to cart'); // copy tiếng Anh (fallback vi chấp nhận nội dung data)

  const viPdp = await request.get(`${STOREFRONT}/vi/p/${slugEn}`);
  expect(viPdp.status()).toBe(200); // en-slug mở ở vi → vẫn render (không crash)
});

test('§5.13 partner Open API: key đúng 200, key sai 401, docs portal mở', async () => {
  const ok = await fetch(`${GATEWAY}/open-api/v1/products`, {
    headers: { 'X-API-Key': PARTNER_KEY }
  });
  expect(ok.status, 'X-API-Key hợp lệ → 200').toBe(200);

  const bad = await fetch(`${GATEWAY}/open-api/v1/products`, {
    headers: { 'X-API-Key': 'pk_deadbeefdeadbeefdeadbeefdeadbeef' }
  });
  expect(bad.status, 'key sai → 401').toBe(401);

  const none = await fetch(`${GATEWAY}/open-api/v1/products`);
  expect(none.status, 'thiếu key → 401').toBe(401);

  const docs = await fetch(`${GATEWAY}/open-api/v1/docs`);
  expect(docs.status, 'docs portal swagger').toBe(200);
});

test('§5.14 affiliate: ?ref= → cookie attribution + track click (không lỗi)', async ({ page, context }) => {
  // đăng ký affiliate thật (user demo) + lấy code
  const { login } = await import('../helpers/api');
  const demo = await login(env('DEMO_USER_EMAIL') || 'user@demo.vn', env('DEMO_USER_PASSWORD') || 'Demo#2026');
  const reg = await fetch(`${GATEWAY}/api/affiliate/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demo.accessToken}` },
    body: JSON.stringify({ note: 'e2e affiliate' })
  });
  const regBody = (await reg.json().catch(() => ({}))) as { code?: string; id?: string; status?: string; detail?: string };
  let code = regBody.code ?? '';
  if (!code && reg.status === 409) {
    // đã có hồ sơ (chạy trước) — lấy code qua /api/affiliate/me
    const me = await fetch(`${GATEWAY}/api/affiliate/me`, {
      headers: { Authorization: `Bearer ${demo.accessToken}` }
    });
    const meBody = (await me.json()) as { code?: string; affiliate?: { code?: string } };
    code = meBody.code ?? meBody.affiliate?.code ?? '';
  }
  if (!code && regBody.id) {
    // PENDING → admin approve → lấy code
    const { login: loginAgain } = await import('../helpers/api');
    const admin = await loginAgain(env('ADMIN_EMAIL') || 'admin@demo.vn', env('ADMIN_PASSWORD') || 'admin123');
    const approve = await fetch(`${GATEWAY}/api/affiliate/admin/affiliates/${regBody.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as { code?: string };
    code = approved.code ?? '';
  }
  expect(code, 'affiliate code sau approve').not.toBe('');

  // khách click link ?ref= → storefront capture → cookie aff_ref + redirect sạch
  await page.goto(`${STOREFRONT}/vi?ref=${code}`);
  await expect(page).not.toHaveURL(/ref=/); // ?ref bị strip sau capture
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'aff_ref')?.value).toBe(code);

  // commission ledger [PENDING-STRIPE-KEYS] — cần đơn CONFIRMED qua link
  test.info().annotations.push({
    type: STRIPE_READY ? 'stripe-mode' : 'pending',
    description: STRIPE_READY
      ? 'mua qua link → dashboard conversion (golden-path mở rộng)'
      : PENDING + ' — commission cần order.confirmed'
  });
});
