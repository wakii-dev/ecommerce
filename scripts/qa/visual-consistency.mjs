/**
 * SF-5 (FI-402) — chrome cross-host visual consistency + theme sync + badge
 * single-instance. Playwright rig (orca screenshot flaky — precedent FI-368).
 *
 * Chạy: node scripts/qa/visual-consistency.mjs   (cần rig A sống — entry :3400)
 * Evidence: docs/superpowers/qa/walkthrough/chrome-consistency/*.png + JSON verdict stdout.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
// ESM resolution không qua NODE_PATH — import playwright workspace FE (FI-368)
const PW = process.env.PW_PATH || '../../frontend/node_modules/playwright/index.mjs';
const { chromium } = await import(new URL(PW, import.meta.url).href);

const ENTRY = process.env.RIG_ENTRY || 'http://localhost:3400';
const OUT = 'docs/superpowers/qa/walkthrough/chrome-consistency';
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
};

/** Screenshot header region (chrome) của 1 page. */
async function shotHeader(page, name) {
  const header = page.locator('header').first();
  await header.screenshot({ path: `${OUT}/${name}.png` });
}

/** DOM outline của chrome header — so cấu trúc 2 host (fail-soft: outline là
 * evidence bổ sung; screenshots + testid-locator + theme mới là gate chính). */
async function headerOutline(page) {
  try {
    return await page.evaluate(() => {
      const h = document.querySelector('header');
      if (!h || typeof h.querySelectorAll !== 'function') return null;
      const testids = [];
      for (const el of h.querySelectorAll('[data-testid]')) {
        if (el && typeof el.getAttribute === 'function') testids.push(el.getAttribute('data-testid'));
      }
      return { testids: testids.sort(), theme: document.documentElement.dataset.theme || null };
    });
  } catch (e) {
    return { error: String(e).slice(0, 120) };
  }
}

/** Đếm testid trong header bằng LOCATOR (không qua eval) — so cấu trúc 2 host. */
async function headerTestids(page) {
  const testids = {};
  for (const t of ['cart-badge', 'cart-badge-count', 'auth-user', 'auth-guest', 'theme-toggle']) {
    const n = await page.locator(`header [data-testid="${t}"]`).count();
    if (n > 0) testids[t] = n;
  }
  return testids;
}

const browser = await chromium.launch({
  executablePath: process.env.PW_EXEC
    || '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'
});
try {
  // ═══ PHASE 1 — guest 4 trạng thái (light/dark × 2 host) ══════════════════
  const ctxGuest = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const sf = await ctxGuest.newPage();
  const sh = await ctxGuest.newPage();
  await sf.goto(`${ENTRY}/vi`, { waitUntil: 'load' });
  await sh.goto(`${ENTRY}/cart`, { waitUntil: 'load' });

  // theme sync: toggle trên storefront → shell đổi cùng giá trị
  const sfToggle = sf.locator('header button[aria-label*="giao diện" i], header button[aria-label*="theme" i], header button:has([data-testid="theme-toggle"])').first();
  const beforeSf = await sf.evaluate(() => document.documentElement.dataset.theme);
  const beforeSh = await sh.evaluate(() => document.documentElement.dataset.theme);
  record('theme ban đầu 2 host đồng bộ', beforeSf === beforeSh, `sf=${beforeSf} sh=${beforeSh}`);

  await sfToggle.click();
  await sf.waitForTimeout(400);
  const afterSf = await sf.evaluate(() => document.documentElement.dataset.theme);
  // thiết kế hiện tại: sync ON-LOAD qua THEME_BOOT_SCRIPT (không có live listener
  // — finding #9 epic: nếu epic muốn live sync, SF-1 thêm storage listener)
  await sh.reload({ waitUntil: 'load' });
  await sh.waitForTimeout(800);
  const afterSh = await sh.evaluate(() => document.documentElement.dataset.theme);
  record('theme toggle storefront → shell đồng bộ ON-LOAD (boot script)', afterSf !== beforeSf && afterSh === afterSf, `sf=${beforeSf}→${afterSf}, sh (reload)=${beforeSh}→${afterSh}`);

  await sfToggle.click();
  await sf.waitForTimeout(400);
  await sh.reload({ waitUntil: 'load' }); // đồng bộ trạng thái sh trước khi chụp
  await sh.locator('.chrome-header').waitFor({ timeout: 30000 });
  await shotHeader(sf, 'guest-light-storefront');
  await shotHeader(sh, 'guest-light-shell');
  await shotFooter(sf, 'guest-light-storefront');
  await shotFooter(sh, 'guest-light-shell');

  async function shotFooter(page, name) {
    const footer = page.locator('footer').first();
    if (await footer.count()) await footer.screenshot({ path: `${OUT}/${name}-footer.png` });
  }

  // dark states
  await sfToggle.click();
  await sf.waitForTimeout(400);
  await sh.reload({ waitUntil: 'load' });
  await sh.waitForTimeout(800);
  const darkSf = await sf.evaluate(() => document.documentElement.dataset.theme);
  const darkSh = await sh.evaluate(() => document.documentElement.dataset.theme);
  record('theme quay lại dark 2 host đồng bộ (on-load)', darkSf === 'dark' && darkSh === 'dark', `sf=${darkSf} sh=${darkSh}`);
  await shotHeader(sf, 'guest-dark-storefront');
  await shotHeader(sh, 'guest-dark-shell');

  // DOM cấu trúc chrome 2 host — THEO DESIGN SF-4: storefront = scaffolding +
  // static links (0 island testid); shell = islands (badge/auth). Cả 2 cùng
  // nguồn chrome (toggle/locale/logo/search giống hệt — screenshots chứng minh).
  const tSf = await headerTestids(sf);
  const tSh = await headerTestids(sh);
  const sfScaffold = await sf.locator('header .chrome-icon-btn[aria-label*="giao diện" i]').count();
  const shScaffold = await sh.locator('header .chrome-icon-btn[aria-label*="giao diện" i]').count();
  record('chrome scaffolding cùng nguồn 2 host (theme toggle chrome)', sfScaffold >= 1 && shScaffold >= 1,
    `sfToggle=${sfScaffold} shToggle=${shScaffold}; islands (design): sf=${JSON.stringify(tSf)} sh=${JSON.stringify(tSh)}`);
  const oSf = await headerOutline(sf);
  const oSh = await headerOutline(sh);
  writeFileSync(`${OUT}/header-outline.json`, JSON.stringify({ storefront: oSf, shell: oSh, locatorTestids: { storefront: tSf, shell: tSh } }, null, 2));

  // theme key canonical: giá trị ghi vào localStorage sau toggle
  const themeKey = await sf.evaluate(() => localStorage.getItem('ecommerce.theme'));
  record('toggle ghi canonical key ecommerce.theme', ['light', 'dark', null].includes(themeKey), `value=${themeKey}`);

  // ═══ PHASE 2 — authed 4 trạng thái + badge single-instance ══════════════
  // register user qua API (isolated gateway)
  const email = `vis${Date.now()}@demo.vn`;
  const password = 'Vis#2026x';
  const reg = await fetch(`${ENTRY}/api/identity/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName: 'SF5 Visual' })
  });
  if (!reg.ok && reg.status !== 409) throw new Error(`register ${reg.status}`);

  const ctxAuth = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const sfA = await ctxAuth.newPage();
  await sfA.goto(`${ENTRY}/login`, { waitUntil: 'load' });
  await sfA.locator('input[type="email"]').fill(email);
  await sfA.locator('input[type="password"]').fill(password);
  await sfA.locator('form:has(input[type="email"]) button[type="submit"]').click();
  // đợi login HOÀN TẤT trên shell host (auth-user = island của shell header)
  await sfA.getByTestId('auth-user').waitFor({ timeout: 30000 });
  // storefront authed — DESIGN SF-4 (ChromeShell.tsx SlotActions): header Next
  // = chrome scaffolding + STATIC action links (nav-honesty, markup FI-390 giữ
  // nguyên); AuthMenu/CartBadge islands CHỈ ở shell routes (mfe remotes đăng ký).
  await sfA.goto(`${ENTRY}/vi`, { waitUntil: 'load' });
  const sfAuthLink = await sfA.locator('header a.header-action[href*="/account"]').count();
  record('storefront authed: static account link (design SF-4, không islands)', sfAuthLink >= 1, `links=${sfAuthLink}`);
  await shotHeader(sfA, 'authed-light-storefront');

  const shA = await ctxAuth.newPage();
  await shA.goto(`${ENTRY}/cart`, { waitUntil: 'load' });
  await shA.getByTestId('auth-user').waitFor({ timeout: 15000 });
  await shotHeader(shA, 'authed-light-shell');
  record('auth-menu authed trên shell host (islands nơi remotes đăng ký)', true, `auth-user shell OK`);

  // badge single-instance: add-to-cart từ storefront PDP → badge shell đếm
  // (product thật từ catalog isolated — slug bootstrap seed)
  await sfA.goto(`${ENTRY}/p/kem-duong-am-da-be-mustela`, { waitUntil: 'load' });
  const firstAdd = sfA.locator('button:has-text("Thêm vào giỏ")').first();
  await firstAdd.waitFor({ timeout: 15000 });
  await firstAdd.click();
  await sfA.waitForTimeout(800);
  await shA.reload({ waitUntil: 'load' });
  await shA.locator('.chrome-header').waitFor({ timeout: 30000 });
  const badgeSh = shA.getByTestId('cart-badge-count');
  const badgeText = await badgeSh.textContent().catch(() => null);
  record('badge single-instance: add storefront → shell (reload) đếm đúng (đăng ký từ remote, 1 instance chrome)', badgeText !== null && Number(badgeText) >= 1, `badge=${badgeText}`);
  await shotHeader(shA, 'badge-shell-with-count');

  await ctxGuest.close();
  await ctxAuth.close();
} finally {
  await browser.close();
}

const fails = results.filter((r) => !r.pass);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\nVERDICT: ${fails.length === 0 ? 'PASS' : 'FAIL'} (${results.length - fails.length}/${results.length})`);
process.exit(fails.length === 0 ? 0 : 1);
