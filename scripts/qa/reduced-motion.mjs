/* T3 reduced-motion sweep (FI-396 / SF-6 convergence QA).
 * READ-ONLY sweeper: only UI interactions (open drawer, one ATC for toast
 * per task instruction). No order placement, no coupon toggle.
 * Run: node scripts/qa/reduced-motion.mjs
 */
import { chromium } from 'file:///Users/hoivu/orca/projects/ecommerce/frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const EXE = '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const WT = '/Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa';
const SHOT = `${WT}/docs/superpowers/qa/walkthrough/reduced-motion`;
const NEXT = 'http://127.0.0.1:3101';
const SHELL = 'http://localhost:5703';
const ACC = 'http://localhost:5706';
const ADMIN = 'http://localhost:5707';
const GATEWAY = 'http://127.0.0.1:8080';

fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const rec = (id, name, pass, evidence, fail = '') => {
  results.push({ id, name, pass, evidence, fail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} | ${name} | ${evidence}${fail ? ' | ' + fail : ''}`);
};

/* In-page probes */
const animProbe = () => {
  const anims = [], trans = [];
  const els = [...document.querySelectorAll('body *')].slice(0, 400);
  const push = (arr, el, pseudo, cs) => {
    if (cs.animationName && cs.animationName !== 'none')
      anims.push({ sel: el.tagName.toLowerCase() + (pseudo || '') + '.' + String(el.className).split(' ').slice(0, 2).join('.'), name: cs.animationName, dur: cs.animationDuration });
    if (cs.transitionDuration && cs.transitionDuration !== '0s' && trans.length < 6)
      trans.push({ sel: el.tagName.toLowerCase() + (pseudo || ''), td: cs.transitionDuration });
  };
  for (const el of els) {
    push(anims, el, '', getComputedStyle(el));
    if (anims.length < 8) { push(anims, el, '::before', getComputedStyle(el, '::before')); push(anims, el, '::after', getComputedStyle(el, '::after')); }
  }
  let gateCss = false;
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) { if (r.cssText && r.cssText.includes('uk-reveal--pending')) { gateCss = true; break; } } } catch { /* cross-origin */ }
    if (gateCss) break;
  }
  return { anims: anims.slice(0, 8), trans, gateCss };
};
const ms = (v) => parseFloat(v);
const gateOk = (p) => p.anims.every(a => ms(a.dur) <= 0.011) && p.trans.every(t => ms(t.td) <= 0.011);

async function gateCheck(page, id, label) {
  const p = await page.evaluate(animProbe);
  const ok = gateOk(p);
  const armed = p.anims.length + p.trans.length > 0;
  const pass = ok && (armed || p.gateCss);
  rec(id, `global-gate ${label}`, pass,
    `anims=${p.anims.length} trans=${p.trans.length} gateCss=${p.gateCss} animDurs=[${[...new Set(p.anims.map(a => a.dur))].join(',')}] transDurs=[${[...new Set(p.trans.map(t => t.td))].join(',')}]`,
    ok ? (!armed && !p.gateCss ? 'no animated els AND ui-kit gate stylesheet NOT loaded — check ui-kit import' : '') : 'found animation/transition NOT gated to 0.01ms');
  return p;
}

async function login(page, base, email, pass) {
  await page.goto(base + '/login', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const em = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
  const pw = page.locator('input[type="password"]').first();
  if (await em.count() === 0 || await pw.count() === 0) return { ok: false, why: 'login form fields not found at ' + page.url() };
  await em.fill(email); await pw.fill(pass);
  await page.locator('button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1800);
  const stillLogin = /login/.test(page.url());
  return { ok: !stillLogin, why: stillLogin ? 'still on ' + page.url() + ' after submit' : '' };
}

/* Hero auto-rotate sampler: active-dot index + track transform */
const heroSample = () => {
  const sec = document.querySelector('section.hero, [class*="hero"]');
  if (!sec) return null;
  const btns = [...sec.querySelectorAll('button, [role="tab"]')];
  const dots = btns.map((b, i) => ({ i, cls: b.className, cur: b.getAttribute('aria-current'), pressed: b.getAttribute('aria-pressed') }));
  const track = sec.querySelector('[class*="track"], [class*="slides"]');
  return { transform: track ? getComputedStyle(track).transform : null, active: JSON.stringify(dots.filter(d => d.cur || d.pressed || /active/.test(d.cls))) };
};

const browser = await chromium.launch({ executablePath: EXE });

/* ═══════════ REDUCE CONTEXT ═══════════ */
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);

  // ── 1/2/3. Storefront home: gate + ken-burns + render ──
  await page.goto(NEXT + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await gateCheck(page, 'RM-1', 'Next home');
  const kb = await page.evaluate(() => {
    const slide = document.querySelector('.hero-slide') || document.querySelector('[class*="hero-slide"]');
    if (!slide) return { found: false };
    const cs = getComputedStyle(slide, '::before');
    const box = slide.getBoundingClientRect();
    return { found: true, animName: cs.animationName, animDur: cs.animationDuration, transform: cs.transform, w: box.width, h: box.height };
  });
  rec('RM-2', 'ken-burns hero gate (.hero-slide::before)', kb.found && kb.animName === 'none',
    kb.found ? `animation-name=${kb.animName} dur=${kb.animDur} transform=${kb.transform}` : 'no .hero-slide element',
    kb.found ? (kb.animName !== 'none' ? 'ken-burns animation still ACTIVE under reduce' : '') : 'selector missing — investigate SF-2 hero markup');
  if (kb.found) rec('RM-3', 'hero still renders (static frame)', kb.w > 100 && kb.h > 100, `slide box ${Math.round(kb.w)}x${Math.round(kb.h)}`);
  await page.screenshot({ path: SHOT + '/rm-home-top.png' });

  // ── 4. Hero auto-rotate stopped, controls work ──
  const s0 = await page.evaluate(heroSample);
  await page.waitForTimeout(7000);
  const s1 = await page.evaluate(heroSample);
  const stopped = s0 && s1 && s0.transform === s1.transform && s0.active === s1.active;
  rec('RM-4a', 'hero auto-rotate STOPPED over 7s', !!stopped,
    s0 ? `t0=${s0.active}|${s0.transform} → t+7s=${s1.active}|${s1.transform}` : 'hero not found');
  // controls: click next arrow (last prev/next button), then a dot
  const ctrl = await page.evaluate(() => {
    const sec = document.querySelector('section.hero, [class*="hero"]');
    if (!sec) return null;
    const btns = [...sec.querySelectorAll('button')];
    return { n: btns.length, labels: btns.map(b => b.getAttribute('aria-label')).filter(Boolean) };
  });
  let ctrlWorked = false, ctrlEv = 'no buttons';
  if (ctrl && ctrl.n >= 2) {
    const before = await page.evaluate(heroSample);
    // nth(1) = "Slide sau" next-arrow (nth(n-1) is the PAUSE button — toggles, no slide change)
    await page.locator('section.hero button, [class*="hero"] button').nth(1).click().catch(() => {});
    await page.waitForTimeout(400);
    const after = await page.evaluate(heroSample);
    ctrlWorked = before && after && (before.active !== after.active || before.transform !== after.transform);
    ctrlEv = `labels=[${ctrl.labels.join(' | ')}] active ${before && before.active} → ${after && after.active}`;
  }
  rec('RM-4b', 'hero arrows/dots still work under reduce', !!ctrlWorked, ctrlEv, ctrlWorked ? '' : 'arrow/dot click did not change slide');

  // ── 5. Reveal sections visible immediately (no scroll) ──
  // useReveal is a JS no-op under reduce (classes never added) — so expect
  // 0 pending wrappers AND below-fold content at full opacity.
  const reveal = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[class*="uk-reveal"]')];
    const below = [...document.querySelectorAll('main section, [class*="section"]')].filter(s => s.getBoundingClientRect().top > 600).slice(0, 3);
    return {
      n: els.length, pending: els.filter(e => /--pending/.test(e.className)).length,
      belowOps: below.map(s => getComputedStyle(s).opacity),
    };
  });
  rec('RM-5', 'reveal sections visible without scroll (reduce: no pending, content opaque)',
    reveal.pending === 0 && reveal.belowOps.length > 0 && reveal.belowOps.every(o => o === '1'),
    `uk-reveal els=${reveal.n} pending=${reveal.pending} below-fold section opacity=[${reveal.belowOps.join(',')}] (baseline BL-3 shows pending>0 without reduce)`,
    reveal.pending > 0 ? 'reveal wrappers still pending under reduce' : (reveal.belowOps.length === 0 ? 'no below-fold sections found to sample' : ''));

  // ── 6. Shimmer skeleton (shell /cart — Skeleton while cart API loads; API delayed via per-context route) ──
  {
    // Vite dev proxies /api on the APP origin → delay ANY-origin /api/** (per-context only)
    await ctx.route('**/api/**', async r => { await new Promise(rs => setTimeout(rs, 2500)); await r.continue().catch(() => {}); });
    await page.goto(SHELL + '/cart', { waitUntil: 'load' });
    let sk = null;
    try {
      const skEl = page.locator('[class*="skeleton"]').first();
      await skEl.waitFor({ state: 'visible', timeout: 5000 });
      sk = await skEl.evaluate(el => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return { name: cs.animationName, dur: cs.animationDuration, vis: b.width > 0 && b.height > 0, op: cs.opacity, cls: String(el.className).slice(0, 40) }; });
    } catch { /* no skeleton caught */ }
    rec('RM-6', 'skeleton shimmer gated but skeleton visible (shell /cart)',
      !!sk && sk.vis && parseFloat(sk.dur) <= 0.011,
      sk ? `${sk.cls} animation=${sk.name} dur=${sk.dur} visible=${sk.vis} opacity=${sk.op}` : 'no skeleton seen within 5s (cart may render without loading state)',
      sk ? (parseFloat(sk.dur) > 0.011 ? 'shimmer NOT gated' : '') : 'skeleton not observed');
    await page.screenshot({ path: SHOT + '/rm-cart-skeleton.png' });
    await page.waitForTimeout(3000); // let in-flight delayed routes drain before unroute
    await ctx.unroute('**/api/**');
  }

  // ── 7a. PDP toast: instant show + auto-close (single ATC per task spec) ──
  await page.goto(NEXT + '/c/dien-tu', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const pdpHref = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/p/"]');
    return a ? a.getAttribute('href') : null;
  });
  if (pdpHref) {
    await page.goto(NEXT + pdpHref, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await gateCheck(page, 'RM-8b', 'Next PDP');
    const atc = page.locator('button:has-text("Thêm vào giỏ"), [class*="cta-row"] button, [class*="add-to-cart"]').first();
    if (await atc.count()) {
      await atc.click();
      await page.waitForTimeout(120);
      const t0 = await page.evaluate(() => {
        const t = document.querySelector('.pdp-toast, [class*="toast"]');
        if (!t) return null;
        const cs = getComputedStyle(t);
        return { vis: t.getBoundingClientRect().height > 0, anim: cs.animationName, dur: cs.animationDuration, op: cs.opacity };
      });
      await page.screenshot({ path: SHOT + '/rm-pdp-toast.png' });
      await page.waitForTimeout(4200);
      const t1 = await page.evaluate(() => { const t = document.querySelector('.pdp-toast, [class*="toast"]'); return t ? t.getBoundingClientRect().height > 0 && getComputedStyle(t).opacity !== '0' : false; });
      rec('RM-7a', 'PDP toast instant + auto-close', !!t0 && t0.vis && parseFloat(t0.dur) <= 0.011 && !t1,
        t0 ? `at+120ms vis=${t0.vis} anim=${t0.anim} dur=${t0.dur} opacity=${t0.op}; at+4.3s stillVisible=${t1} pdp=${pdpHref}` : 'toast element not found after ATC click',
        t0 && parseFloat(t0.dur) > 0.011 ? 'toast animation NOT gated' : (!t1 ? '' : 'toast did not auto-close'));
    } else rec('RM-7a', 'PDP toast', false, 'SKIPPED', 'ATC button not found on ' + pdpHref);
  } else rec('RM-7a', 'PDP toast', false, 'SKIPPED', 'no /p/ link on PLP');

  // ── 7b. Shell mini-cart drawer: instant open, functional, ESC closes ──
  await page.goto(SHELL + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await gateCheck(page, 'RM-8c', 'Vite shell home');
  const badge = page.locator('[data-testid="cart-badge"]');
  if (await badge.count()) {
    await badge.click();
    await page.waitForTimeout(100);
    const d0 = await page.evaluate(() => {
      const p = document.querySelector('.mini-cart, [class*="mini-cart__panel"], [class*="drawer"]');
      if (!p) return null;
      const cs = getComputedStyle(p);
      const b = p.getBoundingClientRect();
      return { vis: b.width > 0 && b.height > 0, td: cs.transitionDuration, op: cs.opacity };
    });
    await page.screenshot({ path: SHOT + '/rm-shell-drawer.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const d1 = await page.evaluate(() => { const p = document.querySelector('.mini-cart, [class*="mini-cart__panel"], [class*="drawer"]'); return p ? getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0 : false; });
    rec('RM-7b', 'mini-cart drawer instant open + ESC closes', !!d0 && d0.vis && !d1,
      d0 ? `at+100ms vis=${d0.vis} transition=${d0.td} opacity=${d0.op}; after ESC stillOpen=${d1}` : 'drawer panel not found after badge click',
      d0 && !d0.vis ? 'drawer did not open' : (d1 ? 'ESC did not close drawer' : ''));
  } else rec('RM-7b', 'mini-cart drawer', false, 'SKIPPED', 'cart-badge not found on shell home');

  // ── 8. Remaining Vite surfaces gate probe ──
  await page.goto(ADMIN + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await gateCheck(page, 'RM-8d', 'Vite admin (root)');
  await page.screenshot({ path: SHOT + '/rm-admin.png' });
  await ctx.close();
}

/* ═══════════ BASELINE CONTEXT (no reduce — proves animations exist normally) ═══════════ */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(NEXT + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const kb = await page.evaluate(() => {
    const slide = document.querySelector('.hero-slide') || document.querySelector('[class*="hero-slide"]');
    if (!slide) return { found: false };
    const cs = getComputedStyle(slide, '::before');
    return { found: true, animName: cs.animationName, dur: cs.animationDuration };
  });
  rec('BL-1', 'baseline: ken-burns animates WITHOUT reduce', kb.found && kb.animName !== 'none' && parseFloat(kb.dur) > 0.011,
    kb.found ? `animation=${kb.animName} dur=${kb.dur}` : 'no .hero-slide');
  const r0 = await page.evaluate(heroSample);
  await page.waitForTimeout(7500);
  const r1 = await page.evaluate(heroSample);
  const advanced = r0 && r1 && (r0.active !== r1.active || r0.transform !== r1.transform);
  rec('BL-2', 'baseline: auto-rotate advances WITHOUT reduce', !!advanced,
    r0 ? `t0=${r0.active} → t+7.5s=${r1.active}` : 'hero not found');
  const reveal = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[class*="uk-reveal"]')];
    return { n: els.length, pending: els.filter(e => /--pending/.test(e.className)).length, ops: els.slice(0, 3).map(e => getComputedStyle(e).opacity) };
  });
  rec('BL-3', 'baseline: reveal pending below fold (mechanism exists)', reveal.n > 0 && (reveal.pending > 0 || reveal.ops.some(o => parseFloat(o) < 1)),
    `${reveal.n} reveal els, pending=${reveal.pending}, opacity=[${reveal.ops.join(',')}]`,
    reveal.n === 0 ? 'no uk-reveal on home' : 'reveal all visible pre-scroll in baseline — check if already scrolled/revealed');
  await page.screenshot({ path: SHOT + '/baseline-home.png' });
  await ctx.close();
}

await browser.close();
fs.writeFileSync('/tmp/rm-results.json', JSON.stringify(results, null, 2));
const fails = results.filter(r => !r.pass);
console.log(`\n=== T3 SUMMARY: ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL ===`);
fails.forEach(f => console.log(`  FAIL ${f.id} ${f.name} — ${f.evidence} ${f.fail}`));
