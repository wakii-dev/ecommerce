#!/usr/bin/env node
/**
 * T2 dark-mode-4-state-contrast-sweep (FI-396 / SF-6 convergence QA) — Round 0 tooling
 *
 * Scripted WCAG 2.x contrast sweep — 4 theme states (storefront/dark, admin/admin-dark)
 * trên các page định danh của convergence rig. READ-ONLY vs apps/packages:
 * chỉ set document.documentElement.dataset.theme (cơ chế flip thật của apps,
 * 4 blocks có sẵn trong packages/ui-kit/src/styles/tokens.css).
 *
 * Round 0 tooling fixes (coordinator review — KHÔNG đụng app code):
 *   1. Gradient bg: element có backgroundImage linear-gradient → parse color-stops,
 *      dùng stop GIỮA làm effective bg (bgSource: 'gradient') — hết false-fail ratio 1.09.
 *   2. Glyph node: chỉ đo node thực sự render text (direct text node hoặc descendant
 *      sâu nhất chứa text) — hết false-fail anchor cha màu default-blue khi span con có rule riêng.
 *   3. Visibility: offsetParent/display/visibility/opacity/rect — không đo node ẩn.
 *   4. Phân loại 3 lớp: real-bug (fix-task) / AA design-exception (brand-lock epic Q1,
 *      cấm đổi hex — chỉ note) / pass.
 *
 * Login: shell /login là OAuth flow (IdP redirect) — không script được password-fill
 * trong rig này → admin/account/orders đo ở guest-guard state trên shell /admin/*,
 * ghi note rõ (spec cho phép note skip/state).
 *
 * Output:
 *   scripts/qa/contrast-results.json          — full per-element evidence
 *   docs/superpowers/qa/dark-mode-contrast.md — verdict report (vi)
 */
import { chromium } from 'file:///Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa/frontend/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const EXECUTABLE = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const STOREFRONT = 'http://127.0.0.1:3101';
const SHELL = 'http://localhost:5703';

// ---------------- contrast math (WCAG 2.x) — dùng chung node + browser (stringified) ----------------
function parseColor(str) {
  if (!str) return null;
  str = String(str).trim();
  let m = str.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = str.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: parseInt(h.slice(6, 8), 16) / 255 };
  }
  return null;
}
function blendC(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function luminance(c) {
  const ch = [c.r, c.g, c.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function cr(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function toHex(c) {
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + h(c.r) + h(c.g) + h(c.b);
}
function near(c, hex, tol = 3) {
  const o = parseColor(hex);
  return o && Math.abs(c.r - o.r) <= tol && Math.abs(c.g - o.g) <= tol && Math.abs(c.b - o.b) <= tol;
}
function isLightBg(c) {
  return luminance({ r: c.r, g: c.g, b: c.b }) > 0.5;
}

/** Self-contained collector — chạy trong page.evaluate (helpers được nội suy vào source). */
const collectorSource = `
(() => {
  const parseColor = ${parseColor.toString()};
  const blendC = ${blendC.toString()};
  const luminance = ${luminance.toString()};
  const cr = ${cr.toString()};
  const toHex = ${toHex.toString()};

  const bgFromImage = (cs) => {
    // FIX Round-0 #1: gradient bg — parse color-stops, dùng stop GIỮA làm effective bg
    const bi = cs.backgroundImage || '';
    if (!/gradient/i.test(bi)) return null;
    const stops = bi.match(/rgba?\\([^)]*\\)|#[0-9a-fA-F]{3,8}/g) || [];
    if (!stops.length) return null;
    const mid = stops[Math.floor(stops.length / 2)];
    return { color: parseColor(mid), src: 'gradient', raw: bi.slice(0, 120) };
  };

  const effBg = (el) => {
    // leo ancestor: element bg thường transparent — ghép các lớp bán-trong suốt
    // cho tới lớp opaque đầu tiên; gradient dừng ngay; html transparent → --c-bg.
    const stack = [];
    let node = el;
    let fallback = null;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (node === document.documentElement) {
        const v = cs.getPropertyValue('--c-bg').trim();
        if (v) fallback = parseColor(v);
      }
      const g = bgFromImage(cs);
      if (g && g.color) return { ...g, under: stack.slice() };
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let base = fallback || { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = blendC(stack[i], base);
    return { color: base, src: stack.length ? 'ancestor-blend' : 'html/--c-bg' };
  };

  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    // FIX Round-0 #3: offsetParent null = node/ancestor display:none (trừ position:fixed)
    if (el.offsetParent === null && cs.position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // FIX Round-0 #2: chỉ đo node render glyph — direct text node, hoặc descendant
  // sâu nhất đầu tiên có direct text (hết false-fail anchor cha màu default-blue).
  const directText = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const glyphNode = (el) => {
    if (directText(el)) return { node: el, via: 'self' };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = walker.nextNode())) {
      if (n === el) continue;
      if (directText(n) && isVisible(n)) return { node: n, via: 'descendant' };
    }
    return null;
  };

  const SELS = [
    ['body-text', 'main p, p', 8],
    ['heading', 'h1', 4], ['heading', 'h2', 6], ['heading', 'h3', 6],
    ['muted', '[class*="muted"]', 8],
    ['link', 'a[href]', 12],
    ['price', '.price, [class*="price"]', 8],
    ['badge-pill', '[class*="pill"], [class*="badge"], [class*="tint-"]', 8],
    ['button', 'button, a[class*="btn"], [role="button"]', 10],
    ['form-label', 'label', 6],
    ['form-input', 'input, textarea, select', 6],
    ['table-head', 'thead th', 6],
  ];
  const seen = new Set();
  const out = [];
  for (const [kind, sel, cap] of SELS) {
    let n = 0;
    for (const el of document.querySelectorAll(sel)) {
      if (n >= cap) break;
      if (el.closest('svg, script, style, noscript')) continue;
      if (!isVisible(el)) continue;
      const g = glyphNode(el);
      let target, via;
      if (g) { target = g.node; via = g.via; }
      else if (kind === 'form-input') {
        // input không có text-node (value không phải text node) — vẫn đo:
        // contrast của chữ gõ vào/placeholder = color vs bg của chính input
        target = el; via = 'input-value';
      } else continue; // icon-only / không render text — skip chính đáng
      const text = (target.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48);
      const key = kind + '|' + target.tagName + '|' + String(target.className || '') + '|' + text;
      if (seen.has(key)) continue;
      seen.add(key);
      const text2 = via === 'input-value' ? ((target.value || target.placeholder || '(input)') + '').trim().replace(/\s+/g, ' ').slice(0, 48) : text;
      const cs = getComputedStyle(target);
      const bg = effBg(target);
      if (!bg.color) continue;
      let stackBase = bg.color;
      for (let i = (bg.under || []).length - 1; i >= 0; i--) stackBase = blendC(bg.under[i], stackBase);
      const fgRaw = parseColor(cs.color);
      if (!fgRaw) continue;
      const fg = fgRaw.a < 1 ? blendC(fgRaw, stackBase) : fgRaw;
      out.push({
        kind, sel,
        text: text2,
        cls: String(target.className || '').slice(0, 80),
        tag: target.tagName.toLowerCase(),
        measuredOn: via,
        color: cs.color,
        backgroundColor: toHex(stackBase),
        bgSource: bg.src,
        bgRaw: bg.raw || '',
        fontSize: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight) || 400,
        ratio: Math.round(cr(fg, stackBase) * 100) / 100,
      });
      n++;
    }
  }
  return out;
})();`;

/** Đo 1 page × 1 theme → push vào results. */
async function measure(page, results, p, theme, notes) {
  const key = `${p.name}×${theme}`;
  try {
    await page.goto(p.url, { waitUntil: 'load' });
    await page.waitForTimeout(700); // MFE mount / Next hydration
    // per-navigation: set theme thật rồi đợi CSS apply
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(150);
    const appliedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

    let note = p.note || '';
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim());

    if (p.name === 'confirmation' && bodyText.length <= 40) {
      results.push({ name: p.name, theme, sf: p.sf, status: 'skipped', skipReason: 'không có order state — page không render nội dung (spec cho phép note skip)' });
      return;
    }
    if (/Chưa đăng nhập|Đăng nhập qua shell/.test(bodyText.slice(0, 300))) {
      note = (note ? note + '; ' : '') + 'guest-guard state (login OAuth qua IdP không script được trong rig) — đo guard screen với theme tokens thật';
    }

    const elements = await page.evaluate(collectorSource);
    results.push({
      name: p.name, theme, sf: p.sf, url: p.url, appliedTheme,
      status: 'ok', note,
      count: elements.length,
      elements: elements.map((e) => {
        const isUi = e.kind === 'badge-pill';
        const large = e.fontSize >= 24 || (e.fontSize >= 18.66 && e.fontWeight >= 700);
        const threshold = isUi ? 3.0 : large ? 3.0 : 4.5;
        const basis = isUi ? 'UI component 1.4.11' : large ? 'large text 1.4.3' : 'normal text 1.4.3';
        return {
          ...e,
          threshold,
          thresholdBasis: basis,
          pass: e.ratio >= threshold,
          ...(isUi && e.ratio >= 3 && e.ratio < 4.5 ? { textRuleNote: 'text trong badge pass 3.0 UI-rule nhưng fail 4.5 text-rule' } : {}),
        };
      }),
    });
    console.error(`  ok ${key}: ${elements.length} elements`);
  } catch (e) {
    results.push({ name: p.name, theme, sf: p.sf, url: p.url, status: 'error', error: String(e.message || e).slice(0, 300) });
    console.error(`  ERR ${key}: ${e.message}`);
  }
}

// ---- Round 0 phân loại 3 lớp (coordinator review) ----
// AA design-exception: combo brand-lock epic Q1 — cấm đổi hex → note, KHÔNG phải fix-task.
function classify(f) {
  const fg = parseColor(f.color);
  const bg = parseColor(f.backgroundColor);
  if (!fg || !bg) return 'real-bug';
  const fgHex = toHex({ r: fg.r, g: fg.g, b: fg.b });
  const bgHex = toHex({ r: bg.r, g: bg.g, b: bg.b });
  const whiteOnPrimary = near(fg, '#ffffff', 12) && near(bg, '#f53d2d');
  const accentOnPrimary = near(fg, '#ffd839') && near(bg, '#f53d2d');
  const mutedOnBg = near(fg, '#757575') && (near(bg, '#f5f5f5') || near(bg, '#ffffff', 6));
  const primaryOnLight = near(fg, '#f53d2d') && isLightBg(bg);
  const whiteOnBrandGradient = near(fg, '#ffffff', 12) && f.bgSource === 'gradient';
  if (whiteOnPrimary || accentOnPrimary || mutedOnBg || primaryOnLight || whiteOnBrandGradient) {
    const why = whiteOnBrandGradient ? 'trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết)'
      : whiteOnPrimary ? 'trắng trên primary #F53D2D (brand direction §2.1)'
      : accentOnPrimary ? 'accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1)'
      : mutedOnBg ? 'muted #757575 trên bg #F5F5F5 (breadcrumb)'
      : 'primary #F53D2D link/tab-active trên bg sáng';
    return { cls: 'aa-note', why };
  }
  return { cls: 'real-bug' };
}

async function main() {
  const notes = [];
  const results = [];
  const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true });

  // ---- PDP slug (lọc e2e test products) qua storefront proxy
  let slug = '';
  try {
    const pg = await browser.newContext().then((c) => c.newPage());
    const data = await (await pg.request.get(`${STOREFRONT}/api/catalog/products?page=1&size=50`)).json();
    const items = (data.items || data || []).filter((p) => p && p.slug && !String(p.slug).startsWith('e2e-'));
    slug = (items[0] || {}).slug || '';
    await pg.context().close();
  } catch (e) {
    notes.push(`PDP slug fetch fail: ${e.message}`);
  }
  notes.push(slug ? `PDP slug chọn: ${slug}` : 'Không chọn được PDP slug — pdp skip');
  notes.push('Login: shell /login là OAuth flow (IdP redirect, không phải password-fill thuần) → cart/checkout/account/orders/admin đo ở guest-guard state trên shell :5703, guard screen vẫn render bằng theme tokens thật (admin-dark v.v.)');

  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
  const matrix = [
    // storefront (SF-2)
    { name: 'home', url: `${STOREFRONT}/`, themes: ['storefront', 'dark'], sf: 'SF-2' },
    { name: 'plp-cong-nghe', url: `${STOREFRONT}/c/cong-nghe`, themes: ['storefront', 'dark'], sf: 'SF-2' },
    { name: 'pdp', url: slug ? `${STOREFRONT}/p/${slug}` : null, skipNoUrl: 'không có slug từ /api/catalog/products', themes: ['storefront', 'dark'], sf: 'SF-2' },
    { name: 'search', url: `${STOREFRONT}/search?q=laptop`, themes: ['storefront', 'dark'], sf: 'SF-2' },
    { name: 'coupons', url: `${STOREFRONT}/coupons`, themes: ['storefront', 'dark'], sf: 'SF-2' },
    // shell surfaces (SF-3/SF-4/SF-5 nhúng trong shell :5703)
    { name: 'login', url: `${SHELL}/login`, themes: ['storefront', 'dark'], sf: 'SF-4', note: 'login surface (auth form) — legitimate UI' },
    { name: 'cart', url: `${SHELL}/cart`, themes: ['storefront', 'dark'], sf: 'SF-3' },
    { name: 'checkout', url: `${SHELL}/checkout`, themes: ['storefront', 'dark'], sf: 'SF-3', note: 'step 1; steps 2-3 cần order+login state — bỏ qua theo spec' },
    { name: 'confirmation', url: `${SHELL}/confirmation`, themes: ['storefront', 'dark'], sf: 'SF-3' },
    { name: 'account', url: `${SHELL}/account`, themes: ['storefront', 'dark'], sf: 'SF-4' },
    { name: 'orders', url: `${SHELL}/account/orders`, themes: ['storefront', 'dark'], sf: 'SF-4' },
    { name: 'order-detail', url: `${SHELL}/account/orders/x`, themes: ['storefront', 'dark'], sf: 'SF-4', note: 'không có order state → đo not-found/guard state nếu render' },
    { name: 'admin-dashboard', url: `${SHELL}/admin`, themes: ['admin', 'admin-dark'], sf: 'SF-5' },
    { name: 'admin-products', url: `${SHELL}/admin/products`, themes: ['admin', 'admin-dark'], sf: 'SF-5' },
    { name: 'admin-orders', url: `${SHELL}/admin/orders`, themes: ['admin', 'admin-dark'], sf: 'SF-5' },
  ];
  for (const p of matrix) {
    for (const theme of p.themes) {
      if (!p.url) { results.push({ name: p.name, theme, sf: p.sf, status: 'skipped', skipReason: p.skipNoUrl }); continue; }
      await measure(page, results, p, theme, notes);
    }
  }
  await browser.close();

  // ---- aggregate + phân loại
  for (const r of results) {
    if (r.status !== 'ok') continue;
    r.failCount = r.elements.filter((e) => !e.pass).length;
    r.passCount = r.count - r.failCount;
  }
  const fails = [];
  for (const r of results) {
    if (r.status !== 'ok') continue;
    for (const e of r.elements) {
      if (e.pass) continue;
      const c = classify(e);
      // shell header/mini-nav component dùng chung mọi surface trong shell —
      // fix 1 chỗ, sở hữu về surface shell (SF-3)
      const isShellHeader = /^(header-|shell-|um-|mini-nav)/.test(e.cls) || ['Danh mục', 'Tìm kiếm'].includes(e.text.trim());
      fails.push({
        page: r.name, theme: r.theme,
        sf: /(^|\s)uk-/.test(e.cls) ? 'SF-1' : isShellHeader ? 'SF-3' : r.sf,
        class: typeof c === 'string' ? c : c.cls,
        aaWhy: typeof c === 'string' ? '' : c.why,
        ...pick(e, ['kind', 'sel', 'tag', 'cls', 'text', 'color', 'backgroundColor', 'bgSource', 'fontSize', 'fontWeight', 'ratio', 'threshold', 'thresholdBasis', 'textRuleNote']),
      });
    }
  }
  const realBugs = fails.filter((f) => f.class === 'real-bug');
  const aaNotes = fails.filter((f) => f.class === 'aa-note');
  const totalChecked = results.filter((r) => r.status === 'ok').reduce((s, r) => s + r.count, 0);
  // Verdict theo rule coordinator Round-0: PASS nếu real-bug CHỈ gồm 2 item đã biết trở xuống
  // (.theme-toggle dark — label đo được là header-action-label "Tối"/"Sáng"; + .plp-brand-input dark — SF-2)
  // VÀ AA-notes liệt kê đầy đủ.
  const isDark = (f) => f.theme === 'dark' || f.theme === 'admin-dark';
  const isKnown = (f) => isDark(f) && (/plp-brand-input/.test(f.cls) || (/header-action-label/.test(f.cls) && /^(Tối|Sáng)$/.test(f.text.trim())));
  const unknownBugs = realBugs.filter((f) => !isKnown(f));
  const verdict = unknownBugs.length === 0 ? 'PASS' : 'FAIL';
  notes.push(`Real-bug ngoài 2 item đã biết (theme-toggle dark, plp-brand-input dark): ${unknownBugs.length}${unknownBugs.length ? ' → ' + unknownBugs.map((f) => `${f.sf}/${f.page}/${f.cls.slice(0, 30)}`).join('; ') : ''}`);

  const evidence = {
    generatedAt: new Date().toISOString(),
    round: 'Round 0 tooling fix — kết quả 148 fail của run trước bao gồm false-fail gradient/node; số này THAY THẾ',
    rig: { storefront: STOREFRONT, shell: SHELL },
    method: 'computed-styles contrast (WCAG 2.x); effective-bg ancestor climb + gradient middle-stop; glyph-node resolution; theme flip qua data-theme attribute',
    classification: { realBug: realBugs.length, aaNote: aaNotes.length, unknownRealBug: unknownBugs.length, unknownList: unknownBugs.map((f) => `${f.sf}/${f.page}/${f.theme}/${(f.cls || f.tag).slice(0, 40)}`), verdictRule: 'PASS nếu real-bug chỉ gồm 2 item đã biết (theme-toggle dark + plp-brand-input dark) trở xuống VÀ AA-notes đầy đủ' },
    totals: { checked: totalChecked, fails: fails.length, verdict },
    notes, results,
  };
  mkdirSync(join(REPO, 'scripts', 'qa'), { recursive: true });
  mkdirSync(join(REPO, 'docs', 'superpowers', 'qa'), { recursive: true });
  writeFileSync(join(REPO, 'scripts', 'qa', 'contrast-results.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(join(REPO, 'docs', 'superpowers', 'qa', 'dark-mode-contrast.md'), renderReport(evidence, realBugs, aaNotes));
  console.log(`DONE verdict=${verdict} checked=${totalChecked} realBug=${realBugs.length} aaNote=${aaNotes.length}`);
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) out[k] = o[k];
  return out;
}

function renderReport(ev, realBugs, aaNotes) {
  const L = [];
  L.push('# Dark-mode 4-state contrast sweep (FI-396 / T2) — Round 0 tooling fix');
  L.push('');
  L.push('> **Round 0 tooling fix — kết quả trước đó (148 fail) bao gồm false-fail gradient/node; số trong báo cáo này THAY THẾ.**');
  L.push('');
  L.push('> Phương pháp: **scripted** — contrast WCAG 2.x đo từ computed styles per theme trên rig sống (không thuần mắt). Background effective: leo ancestor tới lớp opaque đầu tiên; element nền **gradient** → parse color-stops, dùng stop giữa (`bgSource: gradient`); html transparent → `--c-bg`. Chỉ đo node **thực sự render glyph** (direct text node hoặc descendant sâu nhất — anchor cha màu default-blue không còn bị đo nhầm). Node ẩn (`display:none`, `offsetParent` null) không đo.');
  L.push('');
  L.push(`- Ngày chạy: ${ev.generatedAt}`);
  L.push(`- Rig: storefront ${ev.rig.storefront} · shell ${ev.rig.shell}`);
  L.push('- 4 trạng thái theme: `storefront` (light) · `dark` · `admin` (light) · `admin-dark` — flip qua `data-theme` trên `<html>`, đúng cơ chế của apps (4 blocks trong `packages/ui-kit/src/styles/tokens.css`)');
  L.push('- Ngưỡng: text thường ≥ 4.5; large text (≥24px hoặc ≥18.66px bold) ≥ 3.0; UI component badge/pill ≥ 3.0');
  L.push(`- Evidence đầy đủ per element: \`scripts/qa/contrast-results.json\` (${ev.totals.checked} elements đo được)`);
  L.push('');
  L.push('## Ghi chú chạy');
  for (const n of ev.notes) L.push(`- ${n}`);
  L.push('');
  L.push(`**Phân loại: ${ev.classification.realBug} real-bug (fix-task) · ${ev.classification.aaNote} AA design-exception (brand-lock) · verdict rule: ${ev.classification.verdictRule}**`);
  L.push('');
  L.push('## Verdict per page × theme');
  L.push('');
  L.push('| Page | Theme | SF | Pass | Fail | Ghi chú |');
  L.push('|------|-------|----|------|------|---------|');
  for (const r of ev.results) {
    if (r.status === 'ok') {
      const noteBits = [r.appliedTheme && r.appliedTheme !== r.theme ? `applied=\`${r.appliedTheme}\`` : '', r.note || ''].filter(Boolean);
      L.push(`| ${r.name} | \`${r.theme}\` | ${r.sf} | ${r.passCount} | ${r.failCount === 0 ? '0' : `**${r.failCount}**`} | ${noteBits.join(' · ') || '—'} |`);
    } else if (r.status === 'skipped') L.push(`| ${r.name} | \`${r.theme}\` | ${r.sf} | — | — | SKIP: ${r.skipReason} |`);
    else L.push(`| ${r.name} | \`${r.theme}\` | ${r.sf} | — | — | ERROR: ${r.error} |`);
  }
  L.push('');
  L.push('## Bảng 1 — Real-bug fix-tasks (coordinator quyết định — executor KHÔNG sửa app code)');
  L.push('');
  if (realBugs.length === 0) {
    L.push('Không có real-bug.');
  } else {
    // group theo signature (element giống hệt lặp qua nhiều page — 1 fix duy nhất)
    const sig = {};
    for (const f of realBugs) {
      const k = [f.sf, f.kind, f.cls.slice(0, 50), f.color, f.backgroundColor, f.bgSource, (f.theme === 'dark' || f.theme === 'admin-dark') ? 'dark' : 'light'].join('¦');
      (sig[k] = sig[k] || { ...f, pages: [], themes: new Set() });
      sig[k].pages.push(f.page);
      sig[k].themes.add(f.theme);
    }
    const groups = Object.values(sig).sort((a, b) => b.pages.length - a.pages.length);
    L.push('| SF | Element (gộp signature) | Text | Màu chữ | Nền effective | bgSource | Theme | Ratio | Ngưỡng | Xuất hiện trên |');
    L.push('|----|--------------------------|-------|---------|---------------|----------|-------|-------|--------|-----------------|');
    for (const g of groups) {
      L.push(`| ${g.sf} | ${g.kind} (\`${(g.cls || g.tag).slice(0, 40)}\`) | ${g.text.slice(0, 26) || '—'} | \`${g.color}\` | \`${g.backgroundColor}\` | ${g.bgSource} | ${[...g.themes].map((t) => `\`${t}\``).join('/')} | **${g.ratio}** | ${g.threshold} | ${[...new Set(g.pages)].join(', ')} |`);
    }
    L.push('');
    L.push(`(${groups.length} signature khác nhau cho ${realBugs.length} fail — element giống hệt lặp qua nhiều page chỉ cần 1 fix.)`);
    L.push('');
    L.push('### Fix-task proposals');
    L.push('');
    for (const g of groups) {
      L.push(`- [${g.sf}] ${[...g.themes].join('/')} — ${g.kind} \`${(g.cls || g.tag).slice(0, 60)}\` (trên: ${[...new Set(g.pages)].join(', ')}): ratio ${g.ratio} < ${g.threshold} (${g.thresholdBasis}); color \`${g.color}\` trên \`${g.backgroundColor}\` (${g.bgSource}); text "${g.text.slice(0, 40)}"${g.textRuleNote ? `; ${g.textRuleNote}` : ''}`);
    }
  }
  L.push('');
  L.push('## Bảng 2 — AA design-exception notes (brand-lock epic Q1 — KHÔNG phải fix-task, cấm đổi hex)');
  L.push('');
  if (aaNotes.length === 0) {
    L.push('Không có combo brand-lock nào dưới ngưỡng AA text.');
  } else {
    L.push('| Combo | SF | Page | Theme | Element | Ratio | Guideline exception |');
    L.push('|-------|----|------|-------|---------|-------|---------------------|');
    const seenCombo = new Set();
    for (const f of aaNotes) {
      const comboKey = f.aaWhy;
      const dup = seenCombo.has(comboKey + f.theme);
      seenCombo.add(comboKey + f.theme);
      L.push(`| ${f.aaWhy} | ${f.sf} | ${f.page} | \`${f.theme}\` | ${f.kind} \`${(f.cls || f.tag).slice(0, 30)}\` | **${f.ratio}** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock)${dup ? ' *(lặp combo)*' : ''} |`);
    }
    L.push('');
    L.push('> Các combo này là lựa chọn brand có chủ ý (direction §2.1) — ghi nhận để audit, KHÔNG tạo fix-task. Nếu sau này brand nới lock, ưu tiên tăng độ đậm/kích thước hoặc đổi nền region thay vì đổi hex token.');
  }
  L.push('');
  L.push('## Bảng 3 — Pass summary');
  L.push('');
  const okRows = ev.results.filter((r) => r.status === 'ok');
  L.push(`- Tổng elements đo được: **${ev.totals.checked}** trên ${okRows.length} page×theme combo`);
  L.push(`- Pass: **${ev.totals.checked - ev.totals.fails}** · Fail: **${ev.totals.fails}** (real-bug ${realBugs.length} + AA-note ${aaNotes.length})`);
  L.push('');
  L.push('| Page | Theme | Pass/Total |');
  L.push('|------|-------|------------|');
  for (const r of okRows) L.push(`| ${r.name} | \`${r.theme}\` | ${r.passCount}/${r.count} |`);
  L.push('');
  L.push('### Skip-list (hợp lệ theo spec)');
  const skips = ev.results.filter((r) => r.status !== 'ok');
  if (skips.length === 0) L.push('- (không có)');
  for (const s of skips) L.push(`- ${s.name}×${s.theme}: ${s.skipReason || s.error}`);
  L.push('');
  L.push('---');
  L.push('');
  L.push(`**VERDICT: ${ev.totals.verdict}** — ${ev.totals.checked} elements đo được; real-bug ${realBugs.length} (ngoài 2 item đã biết: ${ev.classification.unknownRealBug}${ev.classification.unknownList.length ? ' → ' + ev.classification.unknownList.join('; ') : ''}), AA-note ${aaNotes.length} (đã liệt kê đầy đủ).`);
  L.push('');
  return L.join('\n');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
