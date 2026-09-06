#!/usr/bin/env node
/**
 * Render smoke cho storefront-web (plan Task 15) — chỉ AUTHOR ở Task 15,
 * EXECUTE ở Phase 5: cần catalog live + seeded, storefront `next start`,
 * ES live cho search. Không deps ngoài global fetch (node >= 18).
 *
 * Chạy: `pnpm --filter storefront-web smoke` (hoặc `node scripts/render-smoke.mjs`)
 * Env:  GATEWAY_URL (default http://localhost:8080)
 *       BASE_URL    (default http://localhost:3000)
 *       SLUG_VI     (default dien-thoai-xiaomi-redmi-13c)
 *       SLUG_EN     (default xiaomi-redmi-13c-phone)
 *
 * Assert dạng string includes trên HTML SSR — tên product/category expected
 * lấy ĐỘNG qua API (seed-independent). Mọi failure collect vào bảng PASS/FAIL,
 * exit 1 nếu có ít nhất 1 FAIL. Preflight health FAIL → exit 1 ngay.
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SLUG_VI = process.env.SLUG_VI || 'dien-thoai-xiaomi-redmi-13c';
const SLUG_EN = process.env.SLUG_EN || 'xiaomi-redmi-13c-phone';

const TIMEOUT_MS = 15_000;

const results = [];

/** Ghi 1 check vào bảng kết quả — trả ok để caller có thể rẽ nhánh. */
function check(name, ok, note = '') {
  const pass = Boolean(ok);
  results.push({ name, ok: pass, note });
  return pass;
}

/** GET trả { status, body, error } — network error KHÔNG throw (status 0). */
async function get(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    return { status: res.status, body: await res.text(), error: undefined };
  } catch (error) {
    return { status: 0, body: '', error };
  }
}

/** GET + parse JSON — undefined khi non-2xx hoặc body không phải JSON. */
async function getJson(url) {
  const { status, body } = await get(url);
  if (status < 200 || status >= 300) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** Tên node danh mục theo slug — tìm đệ quy (getCategories trả tree children). */
function findCategoryName(nodes, slug) {
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes) {
    if (node?.slug === slug) return node?.name;
    const found = findCategoryName(node?.children, slug);
    if (found) return found;
  }
  return undefined;
}

async function main() {
  // ── Preflight: catalog phải live + UP, không thì mọi assert sau đều ảo ──
  const health = await get(`${GATEWAY_URL}/actuator/health`);
  if (health.status !== 200 || !health.body.includes('"status":"UP"')) {
    console.error(
      `[smoke] Preflight FAIL: GET ${GATEWAY_URL}/actuator/health → status=${health.status} body=${health.body.slice(0, 120)}`,
    );
    console.error('[smoke] catalog chưa chạy — make dev svc=catalog + make dev-fe app=storefront-web trước');
    process.exit(1);
  }

  // Danh sách product vi/en qua API — tên expected dynamic (seed-independent).
  const viPage = await getJson(`${GATEWAY_URL}/api/catalog/products?size=50&locale=vi`);
  const enPage = await getJson(`${GATEWAY_URL}/api/catalog/products?size=50&locale=en`);
  const viItems = Array.isArray(viPage?.items) ? viPage.items : [];
  const enItems = Array.isArray(enPage?.items) ? enPage.items : [];
  if (viItems.length === 0) {
    console.error('[smoke] catalog UP nhưng /api/catalog/products rỗng/lỗi — cần seed dữ liệu trước');
    process.exit(1);
  }
  const viBySlug = viItems.find((p) => p?.slug === SLUG_VI);
  const enBySlug = enItems.find((p) => p?.slug === SLUG_EN || p?.slugEn === SLUG_EN);
  // home render từ list sort=discount (flash rail + featured, Task 11) — expected
  // name lấy từ CÙNG list đó, không phải default-sort items[0] (review Phase 5)
  const discountPage = await getJson(`${GATEWAY_URL}/api/catalog/products?size=24&sort=discount&locale=vi`);
  const discountItems = Array.isArray(discountPage?.items) ? discountPage.items : viItems;
  const homeName = discountItems[0]?.name;
  const viName = viBySlug?.name ?? homeName;
  const enName = enBySlug?.name;

  // ── 1. HOME (middleware rewrite `/` → `/vi`) ────────────────────────────
  const home = await get(`${BASE_URL}/`);
  if (home.status === 0) {
    const code = home.error?.cause?.code ?? home.error?.message ?? 'unknown';
    console.error(`[smoke] storefront chưa chạy/chiếu được tại ${BASE_URL} — make dev-fe app=storefront-web trước (${code})`);
    process.exit(1);
  }
  check('home: GET / → 200', home.status === 200, `status=${home.status}`);
  check('home: hero CTA "Mua ngay"', home.body.includes('Mua ngay'));
  check('home: giá format VND "₫"', home.body.includes('₫'));
  check(
    'home: tên product seed (items[0])',
    home.body.includes(homeName ?? '__never__'),
    homeName ? `expect contains "${homeName}"` : 'items[0] không có name',
  );

  // ── 2. PDP vi ───────────────────────────────────────────────────────────
  const pdpVi = await get(`${BASE_URL}/p/${SLUG_VI}`);
  check(`pdp vi: GET /p/${SLUG_VI} → 200`, pdpVi.status === 200, `status=${pdpVi.status}`);
  check(
    'pdp vi: tên product',
    pdpVi.body.includes(viName ?? '__never__'),
    viName ? `expect contains "${viName}"` : 'không resolve được tên từ API list',
  );
  check('pdp vi: giá "₫"', pdpVi.body.includes('₫'));
  check('pdp vi: script application/ld+json', pdpVi.body.includes('application/ld+json'));
  check('pdp vi: JSON-LD "@type":"Product"', pdpVi.body.includes('"@type":"Product"'));
  check('pdp vi: meta og:title', pdpVi.body.includes('og:title'));
  check('pdp vi: CTA "THÊM VÀO GIỎ"', pdpVi.body.includes('THÊM VÀO GIỎ'));

  // ── 3. PDP en (pass-through, không rewrite) ─────────────────────────────
  const pdpEn = await get(`${BASE_URL}/en/p/${SLUG_EN}`);
  check(`pdp en: GET /en/p/${SLUG_EN} → 200`, pdpEn.status === 200, `status=${pdpEn.status}`);
  const hasEnTranslation = Boolean(enName);
  check(
    'pdp en: tên EN',
    hasEnTranslation && pdpEn.body.includes(enName),
    hasEnTranslation ? `expect contains "${enName}"` : 'không tìm thấy product khớp slugEn trong list en — seed thiếu bản dịch?',
  );
  // noindex chỉ KỲ VỌNG khi product CHƯA có bản dịch en (fallback vi + noindex).
  // Seed bilingual → trang en phải indexable; chỉ assert negative khi chắc chắn có bản dịch.
  if (hasEnTranslation) {
    check('pdp en: KHÔNG noindex (đã có bản dịch en)', !pdpEn.body.includes('noindex'), 'fallback noindex chỉ hợp lệ khi thiếu bản dịch');
  } else {
    console.error('[smoke] note: product thiếu bản dịch en → bỏ qua check noindex (fallback vi + noindex là hành vi đúng)');
  }

  // ── 4. Category ─────────────────────────────────────────────────────────
  const cats = await getJson(`${GATEWAY_URL}/api/catalog/categories?locale=vi`);
  const catName = findCategoryName(cats, 'dien-tu') ?? 'Điện Tử';
  const catPage = await get(`${BASE_URL}/c/dien-tu`);
  check('category: GET /c/dien-tu → 200', catPage.status === 200, `status=${catPage.status}`);
  check(
    `category: tên "${catName}"`,
    catPage.body.includes(catName),
    catName === 'Điện Tử' ? 'tên từ fallback literal (API categories không resolve được)' : 'tên resolve từ API categories',
  );

  // ── 5. Search (ES live bắt buộc) ────────────────────────────────────────
  const search = await get(`${BASE_URL}/search?q=xiaomi`);
  check('search: GET /search?q=xiaomi → 200', search.status === 200, `status=${search.status}`);
  check(
    'search: có ít nhất 1 link /p/',
    search.body.includes('/p/'),
    search.body.includes('/p/')
      ? 'ES live OK'
      : '0 kết quả (EmptyState) — FAIL thật khi catalog+ES up: curl :9200/products/_count > 0, reindex nếu 0',
  );

  // ── 6. Coupons (SF-9 chưa có mã — mock-gate PASS condition) ─────────────
  const coupons = await get(`${BASE_URL}/coupons`);
  check('coupons: GET /coupons → 200', coupons.status === 200, `status=${coupons.status}`);
  check('coupons: empty-state "Chưa có mã giảm giá"', coupons.body.includes('Chưa có mã giảm giá'));

  // ── 7. Sitemap ──────────────────────────────────────────────────────────
  const sitemap = await get(`${BASE_URL}/sitemap.xml`);
  check('sitemap: GET /sitemap.xml → 200', sitemap.status === 200, `status=${sitemap.status}`);
  check('sitemap: chứa <urlset + /p/', sitemap.body.includes('<urlset') && sitemap.body.includes('/p/'));

  // ── 8. Robots ───────────────────────────────────────────────────────────
  const robots = await get(`${BASE_URL}/robots.txt`);
  check('robots: GET /robots.txt → 200', robots.status === 200, `status=${robots.status}`);
  check('robots: "Disallow: /cart" + "Sitemap:"', robots.body.includes('Disallow: /cart') && robots.body.includes('Sitemap:'));

  // ── Bảng kết quả + exit code ────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n=== RENDER SMOKE — ${BASE_URL} (gateway ${GATEWAY_URL}) ===`);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.note}`);
  }
  console.log(`=== ${results.length - failed.length}/${results.length} checks PASS ===`);

  if (failed.length > 0) {
    console.error(`\n[smoke] SMOKE FAIL — ${failed.length}/${results.length} checks fail (xem bảng trên)`);
    process.exit(1);
  }
  console.log('\n[smoke] SMOKE PASS — toàn bộ render checks xanh');
}

main().catch((error) => {
  console.error('[smoke] crash ngoài dự kiến:', error);
  process.exit(1);
});
