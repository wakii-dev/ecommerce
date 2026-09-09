/**
 * SF-5 (FI-402) — T2 one-origin golden-path walkthrough (Rule 0).
 * Coordinator chạy + TỰ NHÌN screenshots. Flow qua entry :3400 KHÔNG đổi port.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
// ESM resolution không đi qua NODE_PATH — import playwright từ workspace FE
// (precedent FI-368: file:// import khi script nằm ngoài package có dep).
const PW = process.env.PW_PATH || '../../frontend/node_modules/playwright/index.mjs';
const { chromium } = await import(new URL(PW, import.meta.url).href);

const ENTRY = process.env.RIG_ENTRY || 'http://localhost:3400';
const OUT = 'docs/superpowers/qa/walkthrough';
mkdirSync(OUT, { recursive: true });

const steps = [];
const step = async (name, fn) => {
  try {
    await fn();
    steps.push({ name, ok: true });
    console.log(`OK — ${name}`);
  } catch (e) {
    steps.push({ name, ok: false, error: String(e).slice(0, 200) });
    console.log(`FAIL — ${name}: ${String(e).slice(0, 160)}`);
    throw e;
  }
};

const browser = await chromium.launch({
  executablePath: process.env.PW_EXEC
    || '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'
});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const err4xx = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 120)}`); });
page.on('response', async (r) => {
  if (r.status() >= 400 && r.request().method() === 'POST') {
    let body = '';
    try { body = (await r.text()).slice(0, 500); } catch {}
    err4xx.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)} BODY=${body}`);
  } else if (r.status() >= 400) {
    err4xx.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`);
  }
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

try {
  // 1. HOME
  await step('home /vi', async () => {
    await page.goto(`${ENTRY}/vi`, { waitUntil: 'load', timeout: 30000 });
    await shot('t2-01-home');
  });

  // 2. PLP — click category đầu trong cat-grid (hoặc nav Danh mục)
  await step('PLP', async () => {
    await page.locator('a[href^="/c/"]').first().click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(600);
    await shot('t2-02-plp');
  });

  // 3. PDP — slug CÓ variant (finding #8: zero-variant product 400 khi đặt hàng — đã file epic;
  // walkthrough đi luồng chính bằng product có variant như golden-path e2e)
  await step('PDP', async () => {
    await page.goto(`${ENTRY}/p/ao-thun-nam-uniqlo-dry-ex`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(600);
    await shot('t2-03-pdp');
  });

  // 4. Add to cart → mini-cart drawer / badge
  await step('add-to-cart', async () => {
    await page.locator('button:has-text("Thêm vào giỏ")').first().click();
    await page.waitForTimeout(900);
    await shot('t2-03b-added');
  });

  // 5. CART qua entry (shell route — same origin, không đổi port)
  await step('cart /cart', async () => {
    await page.goto(`${ENTRY}/cart`, { waitUntil: 'load', timeout: 30000 });
    // vite dev cold-compile màn đầu = blank — wait CHROME RENDER thật (Rule 0)
    await page.locator('.chrome-header').waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('a:has-text("Thanh toán"), button:has-text("Thanh toán")').first().waitFor({ state: 'visible', timeout: 30000 });
    await shot('t2-04-cart');
  });

  // 5b. LOGIN — fresh user mỗi run (cart sạch: cart dồn item run cũ sẽ 400
  // items[0].variantId — finding #8); checkout yêu cầu đăng nhập
  await step('login', async () => {
    const email = `sf5walk${Date.now()}@demo.vn`;
    const password = 'Walk#2026x';
    await fetch(`${ENTRY}/api/identity/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName: 'SF5 Walk' })
    });
    await page.goto(`${ENTRY}/login`, { waitUntil: 'load', timeout: 30000 });
    await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('form:has(input[type="email"]) button[type="submit"]').click();
    await page.getByTestId('auth-user').waitFor({ timeout: 20000 });
  });

  // 6. CHECKOUT
  await step('checkout', async () => {
    await page.goto(`${ENTRY}/checkout`, { waitUntil: 'load', timeout: 30000 });
    await page.locator('.chrome-header').waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForTimeout(1500);
    await shot('t2-05-checkout');
  });

  // fill form + 3-step stepper (địa chỉ → vận chuyển → thanh toán COD)
  await step('checkout fill + COD', async () => {
    const f = page.locator('form:has(button:has-text("Tiếp tục"))').first();
    const inputs = f.locator('input:visible');
    // thứ tự DOM: họ tên, điện thoại, số nhà+đường, phường/xã, quận/huyện, tỉnh/thành
    await inputs.nth(0).fill('SF5 Walkthrough');
    await inputs.nth(1).fill('0900000001');
    await inputs.nth(2).fill('12 Nguyen Hue');
    await inputs.nth(3).fill('Ben Nghe');
    await inputs.nth(4).fill('Quan 1');
    await inputs.nth(5).fill('TP. Hồ Chí Minh');
    await page.waitForTimeout(300);
    await shot('t2-05b-checkout-filled');
    // step 1 → 2
    await page.locator('button:has-text("Tiếp tục")').first().click();
    await page.waitForTimeout(900);
    await shot('t2-05c-step2-shipping');
    // step 2 → 3 (chọn vận chuyển chuẩn đầu tiên)
    await page.locator('button:has-text("Tiếp tục")').first().click();
    await page.waitForTimeout(900);
    await shot('t2-05d-step3-payment');
    // step 3: chọn COD (radio/option "COD" / "khi nhận hàng")
    const cod = page.locator('text=/COD|khi nhận hàng/i').first();
    await cod.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot('t2-05e-cod-selected');
    await page.locator('button:has-text("Đặt hàng")').first().click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    await shot('t2-05f-after-place-order');
  });

  // 7. CONFIRMATION
  await step('confirmation', async () => {
    await page.waitForURL(/order\/confirmation|confirmation/, { timeout: 30000 });
    await page.waitForTimeout(900);
    await shot('t2-06-confirmation');
  });

  // 8. ACCOUNT (đã login — orders list)
  await step('account page', async () => {
    await page.goto(`${ENTRY}/account`, { waitUntil: 'load', timeout: 30000 });
    await page.locator('.chrome-header').waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForTimeout(900);
    await shot('t2-07-account');
  });

  // 9. ADMIN — layout riêng full-bleed
  await step('admin /admin layout riêng', async () => {
    await page.goto(`${ENTRY}/admin`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(900);
    await shot('t2-08-admin');
    const hasChromeHeader = await page.evaluate(() => {
      const h = document.querySelector('header');
      return !!h && !!h.querySelector('[data-testid="cart-badge"], [data-testid="auth-user"], [data-testid="auth-guest"]');
    });
    if (hasChromeHeader) throw new Error('admin BỊ chrome wrap (header chrome có badge/auth) — vi phạm KHÔNG chrome wrap');
  });
} catch (e) {
  console.log('walkthrough dừng ở step fail — screenshots trước đó vẫn lưu');
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/t2-results.json`, JSON.stringify({ steps, consoleErrors: errors.slice(0, 20), http4xx5xx: err4xx }, null, 2));
console.log(`\nSteps: ${steps.filter((s) => s.ok).length}/${steps.length} OK · Console errors: ${errors.length}`);
