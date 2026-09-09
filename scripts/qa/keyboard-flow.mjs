// QA T5 (FI-396 / SF-6): a11y keyboard-only purchase flow.
// Walks home -> login -> search -> PDP -> cart -> checkout -> confirmation -> user menu
// using ONLY page.keyboard (Tab/Enter/Space/Arrows/Escape/typing). No mouse, no locator.click().
// Emits: console trace + /tmp/keyboard-flow-results.json + screenshots in docs/superpowers/qa/walkthrough/keyboard/
import { chromium } from 'file:///Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa/frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa';
const SHOT_DIR = path.join(ROOT, 'docs/superpowers/qa/walkthrough/keyboard');
const OUT_JSON = '/tmp/keyboard-flow-results.json';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const SF = 'http://localhost:3101';
const SHELL = 'http://localhost:5703';
const EXEC = '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const results = [];
let shotIdx = 0;
const cartResponses = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...a) { console.log(...a); }

async function focusInfo(page) {
  return page.evaluate(() => {
    function d(el) {
      if (!el) return 'null';
      if (el === document.body || el === document.documentElement) return 'body';
      const tag = el.tagName ? el.tagName.toLowerCase() : '?';
      const id = el.id ? '#' + el.id : '';
      let cls = '';
      try { cls = '.' + String(el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.'); } catch (e) {}
      let role = '';
      try { role = el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : ''; } catch (e) {}
      let name = '';
      try {
        name = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') ||
          (tag === 'a' ? '' : '') || (el.textContent || '').trim().slice(0, 40) || '';
      } catch (e) {}
      let href = '';
      try { if (tag === 'a') href = ' href=' + String(el.getAttribute('href') || '').slice(0, 50); } catch (e) {}
      const type = tag === 'input' && el.type ? '[type=' + el.type + ']' : '';
      const pressed = el.getAttribute && el.getAttribute('aria-pressed') ? ' pressed=' + el.getAttribute('aria-pressed') : '';
      const checked = el.getAttribute && (el.getAttribute('aria-checked') ? ' checked=' + el.getAttribute('aria-checked') : (tag === 'input' && el.type === 'radio' ? ' checked=' + el.checked : ''));
      const vis = (el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0));
      let fv = '?';
      try { fv = el.matches(':focus-visible'); } catch (e) {}
      let ol = 'css?';
      try { const cs = getComputedStyle(el); ol = cs.outlineStyle + '/' + cs.outlineWidth + '/' + cs.outlineColor + (cs.boxShadow !== 'none' ? ' +bs' : ''); } catch (e) {}
      return `${tag}${type}${id}${cls}${role} "${String(name).slice(0, 46)}"${href}${pressed}${checked}` + (vis ? '' : ' [HIDDEN]') + ` fv=${fv} ol=${ol}`;
    }
    return d(document.activeElement);
  });
}

async function shot(page, name) {
  try {
    shotIdx += 1;
    const p = path.join(SHOT_DIR, `${String(shotIdx).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: p });
    log(`   [shot] ${p}`);
  } catch (e) { log('   [shot-err]', e.message); }
}

async function mark(rec, status, reason) {
  if (rec.status === 'FAIL') return; // don't downgrade FAIL
  rec.status = status;
  if (reason) rec.notes.push(status + ': ' + reason);
}

async function step(name, fn) {
  const rec = { name, status: 'PASS', keys: [], trace: [], notes: [] };
  results.push(rec);
  log(`\n=== STEP: ${name}`);
  try { await fn(rec); } catch (e) { rec.status = 'FAIL'; rec.notes.push('ERROR: ' + String(e.message || e).slice(0, 300)); }
  log(`--- ${rec.status} ${name}`);
  rec.trace.slice(-30).forEach((t) => log('   ' + t));
  rec.notes.forEach((n) => log('   note: ' + n));
  return rec;
}

async function tabUntil(page, rec, testFn, max, label) {
  const trail = [];
  const cap = max || 40;
  for (let i = 0; i < cap; i++) {
    await page.keyboard.press('Tab');
    rec.keys.push('Tab');
    await sleep(80);
    const info = await focusInfo(page);
    trail.push(info);
    if (testFn(info)) {
      trail.forEach((t) => rec.trace.push('tab> ' + t));
      return { ok: true, info };
    }
  }
  trail.forEach((t) => rec.trace.push('tab> ' + t));
  rec.notes.push(`NOT-FOUND via ${cap} Tabs: ${label}`);
  return { ok: false, info: trail[trail.length - 1] };
}

async function kp(page, rec, key) {
  rec.keys.push(key);
  await page.keyboard.press(key);
  await sleep(120);
}

async function waitPath(page, rec, prevUrl, ms) {
  try {
    await page.waitForFunction((p) => location.href !== p, prevUrl, { timeout: ms || 9000 });
    await sleep(700);
    return true;
  } catch {
    rec.notes.push('URL unchanged after action (was ' + prevUrl + ')');
    return false;
  }
}

async function dumpControls(page, rec, what) {
  const rows = await page.evaluate(() => {
    function lbl(el) {
      if (el.labels && el.labels[0]) return el.labels[0].textContent.trim().slice(0, 40);
      return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
    }
    return [...document.querySelectorAll('input,select,textarea,button,[role=radio],[role=checkbox],[role=tab]')]
      .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || '',
        inputMode: el.getAttribute('inputmode') || '',
        label: lbl(el),
        value: String(el.value || '').slice(0, 18),
        text: (el.textContent || '').trim().slice(0, 30),
        disabled: !!el.disabled,
      }));
  });
  rec.notes.push(`controls@${what}: ` + rows.map((r) => `${r.tag}[${r.type}]${r.inputMode ? '(im=' + r.inputMode + ')' : ''}"${r.label || r.text}"${r.value ? '=' + r.value : ''}${r.disabled ? ' DIS' : ''}`).join(' | '));
  return rows;
}

async function overlayProbe(page) {
  return page.evaluate(() => {
    const sels = '[role=dialog],[role=menu],[role=listbox],[aria-modal=true],[class*=drawer i],[class*=modal i],[class*=overlay i],[class*=popover i],[class*=menu i]';
    const open = [...document.querySelectorAll(sels)].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    });
    const ae = document.activeElement;
    return {
      count: open.length,
      descs: open.slice(0, 4).map((el) => (el.getAttribute('role') || el.tagName.toLowerCase()) + '.' + String(el.getAttribute('class') || '').slice(0, 40)),
      focusInside: open.some((el) => el.contains(ae)),
      focusIsBody: ae === document.body,
    };
  });
}

async function goto(page, url) {
  const prev = page.url();
  await page.goto(url, { waitUntil: 'load', timeout: 25000 });
  await sleep(900);
  return prev;
}

// ---------------------------------------------------------------- main
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
page.setDefaultTimeout(9000);
page.on('response', (r) => {
  const m = r.request().method();
  if (m !== 'GET' && /cart|order/i.test(r.url())) cartResponses.push(`${m} ${r.url().replace('http://localhost', '')} -> ${r.status()}`);
});

let productUrl = null;

// ---- STEP 1: storefront home tab order
await step('S1 home-tab-order', async (rec) => {
  await goto(page, SF + '/');
  rec.notes.push('skip-link probe: first Tab');
  const seq = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    rec.keys.push('Tab');
    await sleep(70);
    const info = await focusInfo(page);
    seq.push(info);
    rec.trace.push('tab> ' + info);
    if (/\[HIDDEN\]/.test(info)) { rec.notes.push('HIDDEN element focused: ' + info); mark(rec, 'PARTIAL', 'focus landed on hidden element'); }
  }
  const first = seq[0] || '';
  if (/skip/i.test(first)) rec.notes.push('SKIP-LINK detected as first stop: ' + first);
  else rec.notes.push('no skip-link as first stop (first: ' + first.slice(0, 80) + ')');
  await shot(page, 'home-focus-order');
});

// ---- STEP 2: login via shell /account
await step('S2 login-keyboard', async (rec) => {
  await goto(page, SHELL + '/account');
  rec.notes.push('landed: ' + page.url());
  if (!/login|dang-nhap|signin/i.test(page.url())) rec.notes.push('no login redirect — may already be authed or inline form');
  await dumpControls(page, rec, 'login');
  const email = await tabUntil(page, rec, (t) => /type=email/.test(t) || /email/i.test(t), 15, 'email input');
  if (!email.ok) throw new Error('email field not reachable');
  await page.keyboard.type('user@demo.vn', { delay: 15 });
  rec.keys.push('type email');
  const pw = await tabUntil(page, rec, (t) => /ật khẩu|password|type=password/i.test(t), 8, 'password input');
  if (!pw.ok) throw new Error('password field not reachable');
  await page.keyboard.type('Demo#2026', { delay: 15 });
  rec.keys.push('type password');
  await shot(page, 'login-filled');
  const before = page.url();
  await kp(page, rec, 'Enter');
  await waitPath(page, rec, before, 12000);
  await sleep(1500);
  rec.notes.push('after submit: ' + page.url());
  if (/login|dang-nhap/i.test(page.url())) mark(rec, 'FAIL', 'still on login page after Enter submit');
  else rec.notes.push('LOGIN OK (session cookie set)');
  await shot(page, 'after-login');
});

// ---- STEP 3: search xiaomi -> PLP -> PDP
await step('S3 search-to-pdp', async (rec) => {
  await goto(page, SF + '/');
  const s = await tabUntil(page, rec, (t) => /type=search|role=searchbox|Tìm|search/i.test(t), 20, 'search input');
  if (!s.ok) throw new Error('search input not reachable by keyboard');
  await page.keyboard.type('xiaomi', { delay: 20 });
  rec.keys.push('type "xiaomi"');
  const before = page.url();
  await kp(page, rec, 'Enter');
  const moved = await waitPath(page, rec, before, 10000);
  rec.notes.push('PLP url: ' + page.url() + (moved ? '' : ' (SPA list update, URL same)'));
  await sleep(1200);
  await shot(page, 'plp-xiaomi');
  const plpUrl = page.url();
  const link = await tabUntil(page, rec, (t) => /^a[.\s]/.test(t) && (/\/p\//.test(t) || /xiaomi/i.test(t)), 25, 'first product link');
  if (!link.ok) throw new Error('product link not reachable on PLP');
  const beforePdp = page.url();
  await kp(page, rec, 'Enter');
  await waitPath(page, rec, beforePdp, 10000);
  await sleep(1500);
  productUrl = page.url();
  rec.notes.push('PDP url: ' + productUrl);
  if (!/product|san-pham|\/p\//i.test(productUrl) && productUrl === plpUrl) mark(rec, 'PARTIAL', 'Enter on product link did not navigate');
  await shot(page, 'pdp');
});

// ---- STEP 4: variant chip + add to cart (keyboard)
await step('S4 pdp-add-to-cart', async (rec) => {
  await dumpControls(page, rec, 'pdp');
  const beforeCount = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[aria-label*="iỏ" i],[data-testid*="cart" i]')];
    return els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)).filter(Boolean).slice(0, 4).join(' / ');
  });
  rec.notes.push('cart badge before: ' + (beforeCount || '(none found)'));
  // find a variant chip group: buttons w/ short text, aria-pressed or chip-like class
  const chipTexts = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => (b.offsetParent !== null) && !b.disabled);
    const cand = btns.filter((b) => {
      const t = (b.textContent || '').trim();
      const c = String(b.getAttribute('class') || '');
      return t.length > 0 && t.length <= 16 && !/thêm|giỏ|mua|buy|cart/i.test(t) && (b.getAttribute('aria-pressed') !== null || /chip|variant|option|size|color|swatch/i.test(c) || b.closest('[class*="variant" i],[class*="option" i],[class*="chip" i]') !== null);
    });
    return cand.map((b) => (b.textContent || '').trim());
  });
  if (chipTexts.length) {
    rec.notes.push('variant chips: ' + chipTexts.join(' | '));
    const chip = await tabUntil(page, rec, (t) => chipTexts.some((c) => t.includes('"' + c + '"')), 30, 'variant chip');
    if (chip.ok) {
      const stBefore = chip.info;
      await kp(page, rec, 'Enter');
      const stAfter = await focusInfo(page);
      rec.notes.push(`chip select Enter: before[${stBefore.slice(0, 90)}] after[${stAfter.slice(0, 90)}]`);
      if (stBefore === stAfter && !/pressed=true|checked=true/.test(stAfter)) mark(rec, 'PARTIAL', 'chip state did not visibly change on Enter');
    }
  } else {
    rec.notes.push('no variant chip group detected (single-variant product?)');
  }
  const add = await tabUntil(page, rec, (t) => /THÊM VÀO GIỎ|Thêm vào giỏ|add to cart/i.test(t), 30, 'THÊM VÀO GIỎ button');
  if (!add.ok) throw new Error('add-to-cart button not reachable');
  await kp(page, rec, 'Enter');
  await sleep(600);
  const afterCount = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[aria-label*="iỏ" i],[data-testid*="cart" i]')];
    return els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)).filter(Boolean).slice(0, 4).join(' / ');
  });
  rec.notes.push('cart badge after: ' + (afterCount || '(none found)'));
  rec.notes.push('cart API: ' + (cartResponses.slice(-3).join(' ; ') || '(no cart POST observed)'));
  if (afterCount === beforeCount && !cartResponses.length) mark(rec, 'FAIL', 'no badge change and no cart POST — add likely failed');
  await shot(page, 'pdp-after-add');
  // variant-chip probe on 2nd search hit (may carry color variants; first PDP had none)
  try {
    await goto(page, SF + '/p/dien-thoai-xiaomi-redmi-13c');
    await sleep(1500);
    const chips2 = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => (b.offsetParent !== null) && !b.disabled);
      return btns.filter((b) => {
        const t = (b.textContent || '').trim();
        const c = String(b.getAttribute('class') || '');
        return t.length > 0 && t.length <= 16 && !/thêm|giỏ|mua|buy|cart/i.test(t) && (b.getAttribute('aria-pressed') !== null || /chip|variant|option|swatch/i.test(c) || b.closest('[class*="variant" i],[class*="option" i],[class*="chip" i]') !== null);
      }).map((b) => (b.textContent || '').trim());
    });
    rec.notes.push('PDP2 variant chips: ' + (chips2.join(' | ') || '(none — single variant)'));
    if (chips2.length) {
      const c2 = await tabUntil(page, rec, (t) => chips2.some((x) => t.includes('"' + x + '"')), 30, 'PDP2 variant chip');
      if (c2.ok) {
        const b4 = c2.info;
        await kp(page, rec, 'Enter');
        const a4 = await focusInfo(page);
        rec.notes.push('PDP2 chip Enter: [' + b4.slice(0, 80) + '] -> [' + a4.slice(0, 80) + '] ' + (b4 !== a4 || /pressed=true|checked=true/.test(a4) ? 'state changed' : 'NO visible state change'));
      }
    }
  } catch (e) { rec.notes.push('PDP2 variant probe error: ' + String(e.message || e).slice(0, 120)); }
});

// ---- STEP 5: mini-cart drawer open / trap-check / ESC
async function drawerTest(pg, rec, label) {
  const trig = await tabUntil(pg, rec, (t) => /giỏ|cart/i.test(t) && !/thêm vào/i.test(t) && !/\[HIDDEN\]/.test(t), 30, 'cart trigger (' + label + ')');
  if (!trig.ok) { rec.notes.push('no cart trigger found on ' + label); return false; }
  rec.notes.push('trigger: ' + trig.info.slice(0, 100));
  await kp(pg, rec, 'Enter');
  await sleep(700);
  const ov = await overlayProbe(pg);
  rec.notes.push(`overlay after Enter: count=${ov.count} [${ov.descs.join(', ')}] focusInside=${ov.focusInside} focusIsBody=${ov.focusIsBody}`);
  if (!ov.count) { rec.notes.push('no drawer opened — trigger may navigate to /cart'); return false; }
  const f1 = await focusInfo(pg);
  rec.trace.push('drawer-open focus> ' + f1);
  if (!ov.focusInside && !ov.focusIsBody) mark(rec, 'PARTIAL', 'drawer opened but focus NOT moved inside: ' + f1.slice(0, 90));
  if (ov.focusIsBody) mark(rec, 'PARTIAL', 'drawer opened, focus lost to body');
  // trap check: tab up to 12, see if focus escapes
  let escaped = null;
  for (let i = 0; i < 12; i++) {
    await pg.keyboard.press('Tab');
    rec.keys.push('Tab');
    await sleep(80);
    const info = await focusInfo(pg);
    rec.trace.push('trap> ' + info);
    const inside = await pg.evaluate(() => {
      const sels = '[role=dialog],[aria-modal=true],[class*=drawer i],[class*=modal i]';
      const open = [...document.querySelectorAll(sels)].filter((el) => el.getClientRects().length > 0);
      const ae = document.activeElement;
      return open.length === 0 ? 'overlay-gone' : open.some((el) => el.contains(ae));
    });
    if (inside === false) { escaped = info; break; }
    if (inside === 'overlay-gone') { rec.notes.push('overlay disappeared during tabbing'); break; }
  }
  rec.notes.push(escaped === null ? 'TRAP-CHECK: focus stayed inside drawer for 12 Tabs (wrapped or contained) — no escape' : 'TRAP-CHECK: focus ESCAPED drawer after N tabs -> ' + escaped.slice(0, 90));
  await shot(pg, 'drawer-open');
  await kp(pg, rec, 'Escape');
  await sleep(500);
  const ov2 = await overlayProbe(pg);
  const f2 = await focusInfo(pg);
  rec.notes.push(`after ESC: overlay count=${ov2.count} focus=[${f2.slice(0, 100)}]`);
  if (ov2.count > 0) mark(rec, 'PARTIAL', 'ESC did not close drawer');
  else if (!/giỏ|cart/i.test(f2) && !/body/.test(f2)) mark(rec, 'PARTIAL', 'ESC closed drawer but focus not restored to trigger: ' + f2.slice(0, 80));
  await shot(pg, 'drawer-after-esc');
  return true;
}

await step('S5 mini-cart-drawer', async (rec) => {
  let done = await drawerTest(page, rec, 'storefront ' + page.url());
  if (!done) {
    rec.notes.push('fall back to shell header...');
    await goto(page, SHELL + '/');
    done = await drawerTest(page, rec, 'shell');
  }
  if (!done) mark(rec, 'FAIL', 'mini-cart drawer not verifiable');
});

// ---- STEP 6: cart page stepper + delete line
await step('S6 cart-stepper-delete', async (rec) => {
  await goto(page, SHELL + '/cart');
  await sleep(1000);
  rec.notes.push('cart url: ' + page.url());
  const emptyNow = await page.evaluate(() => /giỏ hàng trống|chưa có sản phẩm|0 sản phẩm/i.test(document.body.innerText));
  if (emptyNow && productUrl) {
    rec.notes.push('cart empty at entry — keyboard re-add from PDP first: ' + productUrl);
    await goto(page, productUrl);
    await sleep(1200);
    const addPre = await tabUntil(page, rec, (t) => /THÊM VÀO GIỎ|Thêm vào giỏ|add to cart/i.test(t), 30, 'add button (pre-fill cart)');
    if (addPre.ok) { await kp(page, rec, 'Enter'); await sleep(800); }
    await goto(page, SHELL + '/cart');
    await sleep(1000);
  }
  await dumpControls(page, rec, 'cart');
  const lines = await page.evaluate(() => document.body.innerText.match(/xóa|Xóa|Xoá|xoá|remove|Remove/g)?.length || 0);
  rec.notes.push('remove-button-ish text hits: ' + lines);
  // quantity stepper: prefer spinbutton, else +/- buttons
  const qty = await tabUntil(page, rec, (t) => /type=number|role=spinbutton/.test(t), 30, 'quantity input');
  if (qty.ok) {
    const v0 = await page.evaluate(() => document.activeElement.value);
    await kp(page, rec, 'ArrowUp');
    const v1 = await page.evaluate(() => document.activeElement.value);
    rec.notes.push(`qty input ArrowUp: ${v0} -> ${v1} ${v0 !== v1 ? '(OK native spinbutton)' : '(NO-OP — record gap if stepper expects buttons)'}`);
    if (v0 === v1) mark(rec, 'PARTIAL', 'ArrowUp on qty input did not change value');
  } else {
    rec.notes.push('no qty input reachable — try +/- buttons');
    const plus = await tabUntil(page, rec, (t) => /\+|tăng|plus|increment/i.test(t) && /button/.test(t), 40, 'plus button');
    if (plus.ok) {
      const v0 = await page.evaluate(() => document.body.innerText.match(/\d+/g)?.join(',') || '');
      await kp(page, rec, 'Enter');
      await sleep(500);
      const v1 = await page.evaluate(() => document.body.innerText.match(/\d+/g)?.join(',') || '');
      rec.notes.push(`plus button Enter: body digits ${v0.slice(0, 40)} -> ${v1.slice(0, 40)}`);
    } else mark(rec, 'PARTIAL', 'quantity stepper not keyboard-operable');
  }
  // delete line
  const del = await tabUntil(page, rec, (t) => /xóa|xoá|remove|trash/i.test(t), 50, 'remove-line button');
  if (del.ok) {
    await kp(page, rec, 'Enter');
    await sleep(600);
    const ov = await overlayProbe(page);
    rec.notes.push(`after remove Enter: overlay count=${ov.count} [${ov.descs.join(',')}] focusInside=${ov.focusInside} focus=[${(await focusInfo(page)).slice(0, 90)}]`);
    if (ov.count) {
      await shot(page, 'cart-remove-confirm');
      // tab twice inside modal then ESC
      await kp(page, rec, 'Tab');
      await kp(page, rec, 'Tab');
      await kp(page, rec, 'Escape');
      await sleep(400);
      const ov2 = await overlayProbe(page);
      rec.notes.push(`modal after ESC: count=${ov2.count} focus=[${(await focusInfo(page)).slice(0, 80)}]`);
      if (ov2.count) mark(rec, 'PARTIAL', 'confirm modal not closed by ESC');
      // re-open and confirm for real — keyboard path must be able to actually delete
      const del2 = await tabUntil(page, rec, (t) => /xóa|xoá|remove/i.test(t), 30, 'remove button (2nd pass)');
      if (del2.ok) {
        await kp(page, rec, 'Enter');
        await sleep(600);
        const cf = await tabUntil(page, rec, (t) => /button/.test(t) && /xóa|xoá|remove|đồng ý/i.test(t) && !/đóng|close/i.test(t), 8, 'modal confirm button');
        if (cf.ok) {
          await kp(page, rec, 'Enter');
          await sleep(900);
          rec.notes.push('modal confirm Enter pressed; badge now: ' + await page.evaluate(() => { const e = document.querySelector('[aria-label*="iỏ" i]'); return e ? e.getAttribute('aria-label') : '(none)'; }));
        } else rec.notes.push('modal confirm button NOT found within 8 tabs (modal buttons may be labeled differently)');
      }
    } else {
      rec.notes.push('no confirm modal — line removed directly');
    }
  } else {
    rec.notes.push('no remove control found — cart may be single-line w/ qty only');
    mark(rec, 'PARTIAL', 'delete-line not verifiable');
  }
  await sleep(600);
  const empty = await page.evaluate(() => /giỏ hàng trống|empty|trống/i.test(document.body.innerText));
  rec.notes.push('cart empty after delete? ' + empty);
  await shot(page, 'cart-after');
  // if we emptied the only line, re-add from PDP for checkout
  if (empty) {
    rec.notes.push('re-adding product for checkout via PDP keyboard path: ' + productUrl);
    await goto(page, productUrl || SF + '/');
    await sleep(1200);
    const add = await tabUntil(page, rec, (t) => /THÊM VÀO GIỎ|Thêm vào giỏ|add to cart/i.test(t), 30, 're-add button');
    if (add.ok) { await kp(page, rec, 'Enter'); await sleep(600); rec.notes.push('re-added to cart'); }
  }
});

// ---- STEP 7: checkout 3 steps -> place order (COD)
await step('S7 checkout-flow', async (rec) => {
  await goto(page, SHELL + '/checkout');
  await sleep(1200);
  rec.notes.push('checkout url: ' + page.url());
  await dumpControls(page, rec, 'checkout-s1');
  await shot(page, 'checkout-s1');
  // fill textboxes by label, keyboard-only
  const filled = [];
  for (let i = 0; i < 45; i++) {
    const t = await focusInfo(page);
    const isBox = /input\[type=text\]|input\[type=tel\]|input\[type=email\]|input\[type=\]|textarea/.test(t);
    const isBtn = /button/.test(t) && /tiếp tục|continue|tiếp theo/i.test(t);
    if (isBtn) { rec.notes.push('reached continue button at tab ' + i); break; }
    if (isBox) {
      const meta = await page.evaluate((el) => {
        function lbl(e) { if (e.labels && e.labels[0]) return e.labels[0].textContent.trim(); return e.getAttribute('aria-label') || e.getAttribute('placeholder') || ''; }
        return { label: lbl(el), val: el.value, im: el.getAttribute('inputmode') || '', type: el.type };
      }, await page.evaluateHandle(() => document.activeElement));
      if (!meta.val) {
        let v = null;
        if (/điện thoại|phone|sdt/i.test(meta.label)) v = '0901234567';
        else if (/địa chỉ|address/i.test(meta.label)) v = '123 Le Loi, Q1, TP.HCM';
        else if (/họ|tên|name/i.test(meta.label)) v = 'Nguyen Van A';
        else if (/email/i.test(meta.label)) v = 'user@demo.vn';
        else if (meta.label) v = '10 Nguyen Hue';
        if (v) {
          await page.keyboard.type(v, { delay: 8 });
          rec.keys.push('type ' + meta.label);
          filled.push(`${meta.label}[type=${meta.type}](im=${meta.im})`);
          if (/điện thoại|phone|sdt/i.test(meta.label)) rec.notes.push(`PHONE input type=${meta.type} inputMode=${meta.im || '(none)'} — numeric-only ${/tel|numeric/.test(meta.type + meta.im) ? 'OK' : 'GAP? keyboard still typed digits only'}`);
        }
      }
    } else if (/select|combobox/.test(t)) {
      await kp(page, rec, 'ArrowDown');
      await kp(page, rec, 'Enter');
      rec.notes.push('select/combobox at tab ' + i + ' — ArrowDown+Enter tried');
    } else if (/checkbox/.test(t) && /đồng ý|điều khoản|term/i.test(t)) {
      await kp(page, rec, 'Space');
      rec.notes.push('terms checkbox Space');
    }
    await page.keyboard.press('Tab');
    rec.keys.push('Tab');
    await sleep(90);
  }
  rec.notes.push('filled: ' + (filled.join(' ; ') || '(nothing — likely prefilled)'));
  const cont = await tabUntil(page, rec, (t) => /button/.test(t) && /tiếp tục|continue|tiếp theo/i.test(t), 25, 'continue btn step1');
  if (cont.ok) { await kp(page, rec, 'Enter'); await sleep(1200); }
  else mark(rec, 'PARTIAL', 'step1 continue not found');
  rec.notes.push('now: ' + page.url());
  await shot(page, 'checkout-s2');
  await dumpControls(page, rec, 'checkout-s2');
  // stepper header arrow-key probe
  const stp = await tabUntil(page, rec, (t) => /role=tab|stepper|step/i.test(t), 20, 'stepper header item');
  if (stp.ok) {
    const a0 = stp.info;
    await kp(page, rec, 'ArrowRight');
    const a1 = await focusInfo(page);
    rec.notes.push(`stepper ArrowRight: [${a0.slice(0, 70)}] -> [${a1.slice(0, 70)}] ${a0 !== a1 ? '(moved)' : '(no-op)'}`);
  } else rec.notes.push('stepper header not tab-reachable (decorative?)');
  // shipping radio
  const ship = await tabUntil(page, rec, (t) => /radio|checked=/.test(t), 30, 'shipping radio');
  if (ship.ok) {
    await kp(page, rec, 'Space');
    const st = await focusInfo(page);
    rec.notes.push('shipping select Space -> ' + st.slice(0, 90));
    if (!/checked=true/.test(st)) { await kp(page, rec, 'ArrowDown'); const st2 = await focusInfo(page); rec.notes.push('retry ArrowDown -> ' + st2.slice(0, 90)); }
  } else mark(rec, 'PARTIAL', 'shipping option not keyboard-reachable');
  const cont2 = await tabUntil(page, rec, (t) => /button/.test(t) && /tiếp tục|continue|tiếp theo/i.test(t), 30, 'continue btn step2');
  if (cont2.ok) { await kp(page, rec, 'Enter'); await sleep(1200); }
  else mark(rec, 'PARTIAL', 'step2 continue not found');
  await shot(page, 'checkout-s3');
  await dumpControls(page, rec, 'checkout-s3');
  // payment: prefer COD
  const payRows = await page.evaluate(() => [...document.querySelectorAll('[role=radio],input[type=radio],[role=checkbox]')].filter((e) => e.offsetParent !== null).map((e) => (e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) || e.value || '').slice(0, 40)));
  rec.notes.push('radios on s3: ' + (payRows.join(' | ') || '(none)'));
  let payOk = false;
  const anyRadio = await tabUntil(page, rec, (t) => /radio/.test(t), 40, 'payment radio group');
  if (anyRadio.ok) {
    const lbl = await page.evaluate((el) => (el.labels && el.labels[0] && el.labels[0].textContent.trim()) || el.getAttribute('aria-label') || el.value || '', await page.evaluateHandle(() => document.activeElement));
    if (/COD|tiền mặt|khi nhận/i.test(lbl)) {
      await kp(page, rec, 'Space'); payOk = true; rec.notes.push('COD selected directly: ' + lbl);
    } else {
      rec.notes.push('first payment radio = "' + lbl + '" — ARROW within group for COD (roving tabindex, Tab skipped non-checked radios)');
      await kp(page, rec, 'ArrowDown');
      const chk = await focusInfo(page);
      const lbl2 = await page.evaluate((el) => (el.labels && el.labels[0] && el.labels[0].textContent.trim()) || el.getAttribute('aria-label') || el.value || '', await page.evaluateHandle(() => document.activeElement));
      rec.notes.push('after ArrowDown: "' + lbl2 + '" [' + chk.slice(0, 90) + ']');
      if (/radio/.test(chk)) {
        await kp(page, rec, 'Space');
        payOk = true;
        rec.notes.push('payment selected: "' + lbl2 + '"' + (/(COD|khi nhận)/i.test(lbl2) ? ' (COD OK)' : ' (NOT COD — Stripe path)'));
      }
    }
  }
  if (!payOk) mark(rec, 'PARTIAL', 'payment option not keyboard-selectable');
  const order = await tabUntil(page, rec, (t) => /button/.test(t) && /kiểm tra & tạo đơn|tạo đơn|ĐẶT HÀNG|đặt hàng|place order/i.test(t), 45, 'order-place button');
  if (!order.ok) throw new Error('ĐẶT HÀNG not reachable');
  await shot(page, 'checkout-review');
  const before = page.url();
  await kp(page, rec, 'Enter');
  try {
    await page.waitForFunction(() => /order|confirm|success|don-hang|thank/i.test(location.href) || /thành công|cảm ơn|đã đặt/i.test(document.body.innerText), { timeout: 15000 });
  } catch { rec.notes.push('no confirmation signal within 15s; url=' + page.url()); }
  await sleep(1500);
  rec.notes.push('after ĐẶT HÀNG: ' + page.url());
  rec.notes.push('order API: ' + (cartResponses.slice(-3).join(' ; ') || '(none)'));
  await shot(page, 'after-place-order');
});

// ---- STEP 8: confirmation focus + CTA
await step('S8 confirmation', async (rec) => {
  const isConf = /order|confirm|success|don-hang|thank/i.test(page.url()) || await page.evaluate(() => /thành công|cảm ơn|đã đặt/i.test(document.body.innerText));
  if (!isConf) { mark(rec, 'FAIL', 'not on confirmation page: ' + page.url()); return; }
  rec.notes.push('confirmation OK: ' + page.url());
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    rec.keys.push('Tab');
    await sleep(70);
    rec.trace.push('tab> ' + (await focusInfo(page)));
  }
  const cta = await tabUntil(page, rec, (t) => /về trang chủ|trang chủ|home|tiếp tục mua/i.test(t), 25, 'Về trang chủ CTA');
  if (cta.ok) {
    const before = page.url();
    await kp(page, rec, 'Enter');
    await waitPath(page, rec, before, 8000);
    rec.notes.push('CTA Enter -> ' + page.url());
  } else mark(rec, 'PARTIAL', 'confirmation CTA not found');
  await shot(page, 'confirmation');
});

// ---- STEP 9: user menu keyboard
await step('S9 user-menu', async (rec) => {
  await goto(page, SHELL + '/');
  const trig = await tabUntil(page, rec, (t) => /um-trigger|tài khoản|account|user@demo|xin chào|avatar|ho sơ/i.test(t) && !/\[HIDDEN\]/.test(t) && /button|a /.test(t), 35, 'user menu trigger');
  if (!trig.ok) { mark(rec, 'FAIL', 'user menu trigger not reachable'); return; }
  rec.notes.push('trigger: ' + trig.info.slice(0, 100));
  await kp(page, rec, 'Enter');
  await sleep(500);
  let ov = await overlayProbe(page);
  rec.notes.push(`menu open: count=${ov.count} [${ov.descs.join(',')}] focusInside=${ov.focusInside} focus=[${(await focusInfo(page)).slice(0, 80)}]`);
  if (!ov.count) mark(rec, 'PARTIAL', 'Enter on trigger did not open menu');
  await shot(page, 'usermenu-open');
  const a0 = await focusInfo(page);
  await kp(page, rec, 'ArrowDown');
  const a1 = await focusInfo(page);
  await kp(page, rec, 'ArrowDown');
  const a2 = await focusInfo(page);
  rec.notes.push(`arrows: [${a0.slice(0, 60)}] -> [${a1.slice(0, 60)}] -> [${a2.slice(0, 60)}] — arrow-nav ${a0 !== a1 || a1 !== a2 ? 'WORKS' : 'NO-OP (gap if menu items expected roving)'}`);
  await kp(page, rec, 'Escape');
  await sleep(400);
  ov = await overlayProbe(page);
  const fAfter = await focusInfo(page);
  rec.notes.push(`after ESC: overlay count=${ov.count} focus=[${fAfter.slice(0, 90)}]`);
  if (ov.count) mark(rec, 'PARTIAL', 'ESC did not close user menu');
  else if (!/um-trigger|tài khoản|account|user@demo|avatar/i.test(fAfter)) mark(rec, 'PARTIAL', 'focus not restored to trigger after ESC: ' + fAfter.slice(0, 70));
  await shot(page, 'usermenu-after-esc');
});

await browser.close();
fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), cartResponses, results }, null, 2));
const counts = {};
results.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
log('\n===== SUMMARY =====');
results.forEach((r) => log(`${r.status}  ${r.name}`));
log('counts: ' + JSON.stringify(counts));
log('json: ' + OUT_JSON);
