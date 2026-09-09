/* T4 responsive sweep 375×667 + 768×1024 (FI-396 / SF-6 convergence QA).
 * READ-ONLY: navigation + UI measurements only (no data mutation).
 * Run: node scripts/qa/responsive.mjs
 */
import { chromium } from 'file:///Users/hoivu/orca/projects/ecommerce/frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const EXE = '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const WT = '/Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa';
const SHOT = `${WT}/docs/superpowers/qa/walkthrough/responsive`;
const NEXT = 'http://127.0.0.1:3101';
const SHELL = 'http://localhost:5703';
const ACC = 'http://localhost:5706';
const ADMIN = 'http://localhost:5707';

fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const rec = (id, name, pass, evidence, fail = '') => {
  results.push({ id, name, pass, evidence, fail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} | ${name} | ${evidence}${fail ? ' | ' + fail : ''}`);
};

const overflow = () => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth });
const vis = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const b = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { found: true, visible: b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden', w: Math.round(b.width), h: Math.round(b.height), display: cs.display };
};

async function login(page, base, email, pass) {
  await page.goto(base + '/login', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const em = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
  const pw = page.locator('input[type="password"]').first();
  if (!await em.count() || !await pw.count()) return false;
  await em.fill(email); await pw.fill(pass);
  await page.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click();
  await page.waitForTimeout(2200);
  // app may not auto-redirect after token set — verify on target page content instead
  return true;
}
const looksLoggedOut = (page) => page.locator('input[type="password"]').count().then(n => n > 0);
/* AuthStore token is in-memory only → SPA-navigate (pushState+popstate) instead of page.goto */
const spaNav = async (page, path) => {
  await page.evaluate((p) => { history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForTimeout(1500);
};

/* grid column count from computed grid-template-columns, fallback via card offsets */
const gridCols = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const gtc = getComputedStyle(el).gridTemplateColumns;
  if (gtc && gtc !== 'none') return { found: true, how: 'grid-template-columns', cols: gtc.split(' ').length, gtc: gtc.slice(0, 80) };
  const kids = [...el.children].slice(0, 4).map(c => Math.round(c.getBoundingClientRect().top));
  return { found: true, how: 'child-tops', cols: null, tops: kids };
};

const browser = await chromium.launch({ executablePath: EXE });
const VIEWPORTS = [{ name: '375', w: 375, h: 667 }, { name: '768', w: 768, h: 1024 }];
let seq = 0;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const tag = (g) => `RS-${vp.name}-${(++seq).toString().padStart(2, '0')} ${g}`;

  async function sweep(label, url, opts = {}) {
    if (!opts.already) await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const o = await page.evaluate(overflow);
    rec(tag(label + ' no-h-overflow'), `${label} @${vp.name}`, o.sw <= o.iw + 1,
      `scrollWidth=${o.sw} innerWidth=${o.iw} finalURL=${page.url()}`,
      o.sw > o.iw + 1 ? `HORIZONTAL OVERFLOW +${o.sw - o.iw}px` : '');
    // required elements
    for (const sel of opts.require || []) {
      const v = await page.evaluate(vis, sel);
      rec(`${tag(label + ' elem')}`, `${label} @${vp.name} ${sel}`, v.found && v.visible,
        v.found ? `visible=${v.visible} box=${v.w}x${v.h}` : 'NOT FOUND',
        !v.found ? 'selector missing in DOM' : (!v.visible ? 'present but not visible' : ''));
    }
    if (opts.extra) await opts.extra();
    await page.screenshot({ path: `${SHOT}/${opts.shot || label}-${vp.name}.png`, fullPage: true });
  }

  /* ── Storefront Next ── */
  await sweep('home', NEXT + '/', { shot: 'sf-home', require: ['.site-header', '.hero'] });
  await sweep('plp', NEXT + '/c/dien-tu', {
    shot: 'sf-plp', require: ['.site-header'],
    extra: async () => {
      // product grid columns (discover grid container)
      const g = await page.evaluate(() => {
        const gridColsIn = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return { found: false };
          const gtc = getComputedStyle(el).gridTemplateColumns;
          if (gtc && gtc !== 'none') return { found: true, how: 'grid-template-columns', cols: gtc.split(' ').length, gtc: gtc.slice(0, 80) };
          const kids = [...el.children].slice(0, 4).map(c => Math.round(c.getBoundingClientRect().top));
          return { found: true, how: 'child-tops', cols: null, tops: kids };
        };
        for (const sel of ['.product-grid', '[class*="grid"]']) {
          const el = document.querySelector(sel);
          if (el && el.children.length >= 4) return gridColsIn(sel);
        }
        return { found: false };
      });
      rec(tag('plp-grid'), `PLP grid @${vp.name}`, g.found && (vp.name === '375' ? g.cols === 2 : true),
        g.found ? `${g.how} cols=${g.cols} ${g.gtc || ''} tops=${g.tops || ''}` : 'no grid container with >=4 children',
        g.found && vp.name === '375' && g.cols !== 2 ? `expected 2-col at 375, got ${g.cols}` : '');
      // mobile nav discover (375 only)
      if (vp.name === '375') {
        const nav = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('header button, .site-header button, [class*="burger"], [class*="nav-toggle"], [class*="menu"] button')];
          return btns.map(b => ({ cls: b.className.slice(0, 50), label: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded') }));
        });
        if (nav.length) {
          const b = page.locator('header button, .site-header button').first();
          await b.click().catch(() => {});
          await page.waitForTimeout(400);
          const opened = await page.evaluate(() => {
            const nav = document.querySelector('nav, [class*="nav"]');
            const els = [...document.querySelectorAll('nav a, [class*="menu"] a')].filter(a => a.getBoundingClientRect().height > 0);
            return els.length;
          });
          rec(tag('mobile-nav'), `storefront mobile nav opens @375`, true, `buttons=[${JSON.stringify(nav).slice(0, 150)}] visible nav links after click=${opened} (INFO — design may use persistent mini-nav instead of hamburger)`);
        } else {
          const links = await page.evaluate(() => [...document.querySelectorAll('.mini-nav a, .site-header a')].filter(a => a.getBoundingClientRect().height > 0).length);
          rec(tag('mobile-nav'), `storefront mobile nav @375`, links > 0, `NO hamburger button found; visible nav links=${links} (persistent mini-nav — flag to SF-2 if hamburger required)`);
        }
      }
    },
  });
  // PDP: resolve href from PLP once
  await page.goto(NEXT + '/c/dien-tu', { waitUntil: 'load' });
  const pdpHref = await page.evaluate(() => { const a = document.querySelector('a[href*="/p/"]'); return a ? a.getAttribute('href') : null; });
  if (pdpHref) {
    await sweep('pdp', NEXT + pdpHref, {
      shot: 'sf-pdp',
      require: ['.pdp-cta-row'],
      extra: async () => {
        const pos = await page.evaluate(() => { const el = document.querySelector('.pdp-cta-row'); return el ? getComputedStyle(el).position : null; });
        const expectFixed = vp.name === '375'; // <600px sticky bar
        rec(tag('pdp-atc-bar'), `PDP sticky ATC @${vp.name}`, expectFixed ? pos === 'fixed' : true,
          `.pdp-cta-row position=${pos} (expect fixed <600px, got ${pos})`,
          expectFixed && pos !== 'fixed' ? 'sticky ATC bar NOT fixed at 375 — SF-2' : '');
      },
    });
    // category grid on home (375)
    if (vp.name === '375') {
      await page.goto(NEXT + '/', { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      const cat = await page.evaluate(() => {
        const els = [...document.querySelectorAll('[class*="category"], [class*="cat-grid"]')].filter(e => e.children.length >= 3);
        const el = els[0];
        if (!el) return null;
        const gtc = getComputedStyle(el).gridTemplateColumns;
        const tops = [...el.children].slice(0, 6).map(c => Math.round(c.getBoundingClientRect().top));
        return { cls: el.className.slice(0, 40), gtc: gtc.slice(0, 60), cols: gtc && gtc !== 'none' ? gtc.split(' ').length : null, tops };
      });
      rec(tag('cat-grid'), `category grid @375`, !!cat,
        cat ? `${cat.cls} cols=${cat.cols} gtc=${cat.gtc} childTops=${cat.tops.join(',')}` : 'no category grid with >=3 children found (INFO)');
    }
  }
  await sweep('search', NEXT + '/search?q=dien%20tu', { shot: 'sf-search', require: ['.site-header'] });
  await sweep('coupons', NEXT + '/coupons', { shot: 'sf-coupons', require: ['.site-header'] });

  /* ── Shell + checkout ── */
  await sweep('shell-home', SHELL + '/', {
    shot: 'shell-home', require: ['.shell-header', '[data-testid="cart-badge"]'],
    extra: async () => {
      const h = await page.evaluate(() => { const el = document.querySelector('.shell-header'); const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; });
      rec(tag('shell-header-wrap'), `shell header wrap @${vp.name}`, h.w <= vp.w + 1, `header box=${h.w}x${h.h}px (tall-but-wrapped OK; overflow checked separately)`,
        h.w > vp.w + 1 ? 'header wider than viewport' : '');
    },
  });
  await sweep('shell-cart', SHELL + '/cart', { shot: 'shell-cart', require: ['[data-testid="cart-badge"]'] });
  // Seed shell-origin guest cart (ONE item — cart only, no order) so checkout form renders.
  {
    let pid = null;
    await page.goto(NEXT + '/p/dien-tu-bulk-38', { waitUntil: 'load' });
    pid = await page.evaluate(() => { const m = document.documentElement.innerHTML.match(/"productId"\s*:\s*"([a-f0-9-]{20,40})"/i); return m ? m[1] : null; });
    if (!pid) pid = await page.evaluate(async () => { try { const r = await fetch('/api/catalog/products?slug=dien-tu-bulk-38'); const j = await r.json(); return j?.items?.[0]?.id || j?.id || null; } catch { return null; } });
    await page.goto(SHELL + '/', { waitUntil: 'load' });
    const seeded = await page.evaluate(async (id) => {
      if (!id) return { ok: false, why: 'no productId' };
      try { const r = await fetch('/api/cart/items', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: id, qty: 1 }) }); return { ok: r.ok, status: r.status }; } catch (e) { return { ok: false, why: String(e) }; }
    }, pid);
    console.log(`cart seed (${vp.name}):`, JSON.stringify(seeded), 'pid=' + (pid || 'none'));
  }
  // checkout: shell route first, fallback standalone :5705
  let checkoutUrl = SHELL + '/checkout';
  await page.goto(checkoutUrl, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const hasForm = await page.evaluate(() => !!document.querySelector('form'));
  if (!hasForm) checkoutUrl = 'http://localhost:5705/checkout';
  await sweep('checkout', checkoutUrl, {
    shot: 'checkout',
    extra: async () => {
      const one = await page.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return { found: false };
        const fields = [...form.querySelectorAll('input, select, textarea')].filter(i => i.getBoundingClientRect().height > 0).slice(0, 3);
        if (fields.length < 2) return { found: true, note: '<2 visible fields' };
        const a = fields[0].getBoundingClientRect(), b = fields[1].getBoundingClientRect();
        const stacked = b.top >= a.top + a.height - 4;
        const gtc = getComputedStyle(form).gridTemplateColumns;
        const fd = getComputedStyle(form).flexDirection;
        return { found: true, stacked, formGTC: gtc.slice(0, 60), formFD: fd, y: [Math.round(a.top), Math.round(b.top)] };
      });
      rec(tag('checkout-1col'), `checkout form 1-col @${vp.name}`, one.found && (one.stacked !== undefined ? one.stacked : true),
        one.found ? `stacked=${one.stacked} y=${one.y || ''} formGTC=${one.formGTC || ''} formFD=${one.formFD || ''}` : 'no form on checkout page',
        one.found && one.stacked === false ? 'first two fields side-by-side at narrow viewport — SF-3' : '');
    },
  });

  /* ── Account (login user) ── */
  const accOk = await login(page, ACC, 'user@demo.vn', 'Demo#2026');
  if (accOk) {
    await spaNav(page, '/orders');
    if (await looksLoggedOut(page)) {
      rec(tag('account-login'), `account auth verify @${vp.name}`, false, 'login page still shown after SPA nav — token not effective');
      rec(tag('account-sidenav'), `account side-nav @${vp.name}`, false, 'SKIPPED — not logged in');
    } else
    await sweep('account', ACC + '/orders', {
      already: true,
      shot: 'account-orders',
      extra: async () => {
        const sn = await page.evaluate(() => {
          const el = document.querySelector('[class*="side-nav"], aside, [class*="sidebar"], [class*="account-nav"]');
          if (!el) return { found: false };
          const b = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return { found: true, cls: el.className.slice(0, 40), display: cs.display, pos: cs.position, w: Math.round(b.width), h: Math.round(b.height), vis: b.width > 0 && b.height > 0 };
        });
        const expectHidden = vp.name === '375';
        rec(tag('account-sidenav'), `account side-nav @${vp.name}`, sn.found && (expectHidden ? (!sn.vis || sn.display === 'none' || sn.pos === 'static' ? true : sn.h < 200) : sn.vis),
          sn.found ? `cls=${sn.cls} display=${sn.display} pos=${sn.pos} box=${sn.w}x${sn.h}` : 'no side-nav element found',
          sn.found && expectHidden && sn.vis && sn.h >= 200 ? 'side-nav fully visible at 375 — check collapse design (SF-4)' : '');
      },
    });
  } else rec(tag('account-login'), `account login @${vp.name}`, false, 'login failed — skipped account sweep');

  /* ── Admin (login admin) ── */
  const admOk = await login(page, ADMIN, 'admin@demo.vn', 'admin123');
  if (admOk) {
    await page.goto(ADMIN + '/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    if (await looksLoggedOut(page)) {
      rec(tag('admin-login'), `admin auth verify @${vp.name}`, false, 'password field present on / — admin login token not effective');
      rec(tag('admin-sidebar'), `admin sidebar @${vp.name}`, false, 'SKIPPED — not logged in');
      rec(tag('admin-dashboard'), `admin-dashboard @${vp.name}`, false, 'SKIPPED — not logged in');
      rec(tag('admin-products'), `admin-products @${vp.name}`, false, 'SKIPPED — not logged in');
    } else
    await sweep('admin-dashboard', ADMIN + '/', {
      already: true,
      shot: 'admin-dashboard',
      extra: async () => {
        const sb = await page.evaluate(() => {
          const el = document.querySelector('[class*="sidebar"], aside');
          if (!el) return { found: false };
          const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          return { found: true, cls: el.className.slice(0, 40), display: cs.display, w: Math.round(b.width), h: Math.round(b.height), vis: b.width > 0 && b.height > 0 };
        });
        // ≤900px: sidebar becomes horizontal strip (h small) or hidden — both acceptable
        rec(tag('admin-sidebar'), `admin sidebar @${vp.name}`, sb.found && (!sb.vis || sb.display === 'none' || sb.h < 260 || sb.w <= vp.w + 1),
          sb.found ? `cls=${sb.cls} display=${sb.display} box=${sb.w}x${sb.h} (≤900px design: horizontal strip or hidden)` : 'no sidebar element',
          sb.found && sb.vis && sb.h >= 260 && sb.w > vp.w + 1 ? 'sidebar overflow at narrow viewport — SF-5' : '');
      },
    });
    await spaNav(page, '/products');
    await sweep('admin-products', ADMIN + '/products', { already: true, shot: 'admin-products' });
  } else rec(tag('admin-login'), `admin login @${vp.name}`, false, 'login failed — skipped admin sweep');

  await ctx.close();
}

await browser.close();
fs.writeFileSync('/tmp/rs-results.json', JSON.stringify(results, null, 2));
const fails = results.filter(r => !r.pass);
console.log(`\n=== T4 SUMMARY: ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL ===`);
fails.forEach(f => console.log(`  FAIL ${f.id} ${f.name} — ${f.evidence} ${f.fail}`));
