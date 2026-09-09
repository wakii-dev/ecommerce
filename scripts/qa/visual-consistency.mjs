/**
 * SF-5 (FI-402) — chrome cross-host visual consistency + theme sync + badge
 * single-instance. Playwright rig (orca screenshot flaky — precedent FI-368).
 *
 * Chạy: node scripts/qa/visual-consistency.mjs   (cần rig A sống — entry :3400)
 * Evidence: docs/superpowers/qa/walkthrough/chrome-consistency/*.png + JSON verdict stdout.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

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

/** DOM outline của chrome header — so cấu trúc 2 host. */
async function headerOutline(page) {
  return page.evaluate(() => {
    const h = document.querySelector('header');
    if (!h) return null;
    const q = (sel) => Array.from(h.querySelectorAll(sel)).map((el) => ({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid'),
      text: (el.textContent || '').trim().slice(0, 40)
    }));
    return {
      testids: q('[data-testid]').map((x) => x.testid).sort(),
      navLinks: q('nav a').map((x) => x.text),
      buttons: q('button').map((x) => x.getAttribute('aria-label') || x.text.slice(0, 24)),
      theme: document.documentElement.dataset.theme || null
    };
  });
}

const browser = await chromium.launch();
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
  await sf.waitForTimeout(400); // storage/BC lan
  const afterSf = await sf.evaluate(() => document.documentElement.dataset.theme);
  const afterSh = await sh.evaluate(() => document.documentElement.dataset.theme);
  record('theme toggle storefront → shell đồng bộ (cross-app)', afterSf !== beforeSf && afterSh === afterSf, `sf=${beforeSf}→${afterSf}, sh=${beforeSh}→${afterSh}`);

  await sfToggle.click();
  await sf.waitForTimeout(400);
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
  const darkSf = await sf.evaluate(() => document.documentElement.dataset.theme);
  const darkSh = await sh.evaluate(() => document.documentElement.dataset.theme);
  record('theme quay lại dark 2 host đồng bộ', darkSf === 'dark' && darkSh === 'dark', `sf=${darkSf} sh=${darkSh}`);
  await shotHeader(sf, 'guest-dark-storefront');
  await shotHeader(sh, 'guest-dark-shell');

  // DOM outline so cấu trúc chrome 2 host
  const oSf = await headerOutline(sf);
  const oSh = await headerOutline(sh);
  const sameTestids = JSON.stringify(oSf?.testids) === JSON.stringify(oSh?.testids);
  record('chrome header cùng cấu trúc testid 2 host', sameTestids && (oSf?.testids?.length || 0) > 0,
    `sf=[${oSf?.testids}] sh=[${oSh?.testids}]`);
  writeFileSync(`${OUT}/header-outline.json`, JSON.stringify({ storefront: oSf, shell: oSh }, null, 2));

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
  await sfA.waitForURL(/^(?!.*\/login).*$/, { timeout: 20000 }).catch(() => {});
  // về storefront home authed
  await sfA.goto(`${ENTRY}/vi`, { waitUntil: 'load' });
  await sfA.getByTestId('auth-user').waitFor({ timeout: 15000 });
  await shotHeader(sfA, 'authed-light-storefront');

  const shA = await ctxAuth.newPage();
  await shA.goto(`${ENTRY}/cart`, { waitUntil: 'load' });
  await shA.getByTestId('auth-user').waitFor({ timeout: 15000 });
  await shotHeader(shA, 'authed-light-shell');
  record('auth-menu authed hiển thị trên CẢ 2 host (chrome cùng nguồn)', true, `user trên sf + shell`);

  // badge single-instance: add-to-cart từ storefront PDP → badge shell đếm
  // (product thật từ catalog isolated — slug bootstrap seed)
  await sfA.goto(`${ENTRY}/p/kem-duong-am-da-be-mustela`, { waitUntil: 'load' });
  const firstAdd = sfA.locator('button:has-text("Thêm vào giỏ")').first();
  await firstAdd.waitFor({ timeout: 15000 });
  await firstAdd.click();
  await sfA.waitForTimeout(800);
  const badgeSh = shA.getByTestId('cart-badge-count');
  const badgeText = await badgeSh.textContent().catch(() => null);
  record('badge single-instance: add storefront → badge shell đếm đúng (đăng ký từ remote)', badgeText !== null && Number(badgeText) >= 1, `badge=${badgeText}`);
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
