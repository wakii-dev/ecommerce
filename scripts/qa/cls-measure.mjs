/**
 * SF-6 T9 — CLS + LCP + font check per URL (FI-396).
 * Cách dùng: node scripts/qa/cls-measure.mjs <url> [<url>...] [--label <tên>]
 * Out: JSON stdout + scripts/qa/cls-results.json (gộp theo label).
 *
 * CLS: buffer toàn bộ layout-shift entries vào window.__shiftEntries rồi tính
 * session-window (gap > 1s hoặc window > 5s thì đóng window) — đúng algorithm
 * web-vitals (bỏ entry hadRecentInput).
 * LCP: 'largest-contentful-paint' entry cuối.
 * Font: computed font-family của body + heading đầu tiên.
 */
import { chromium } from 'file:///Users/hoivu/orca/workspaces/ecommerce/sf-6-convergence-qa/frontend/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const EXEC = '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const args = process.argv.slice(2);
const labelIdx = args.indexOf('--label');
const label = labelIdx >= 0 ? args[labelIdx + 1] : 'run';
const urls = args.filter((a, i) => !a.startsWith('--') && (labelIdx < 0 || i !== labelIdx + 1));
if (!urls.length) { console.error('usage: node cls-measure.mjs <url>... [--label name]'); process.exit(1); }

const browser = await chromium.launch({ executablePath: EXEC });
const results = {};
for (const url of urls) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__shiftEntries = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__shiftEntries.push({ value: e.value, startTime: e.startTime, hadRecentInput: e.hadRecentInput });
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) window.__lcp = entries[entries.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
    const data = await page.evaluate(() => {
      // Session-window CLS từ entries đã buffer (web-vitals algorithm)
      const shifts = (window.__shiftEntries || []).filter((s) => !s.hadRecentInput);
      let best = 0, cur = { sum: 0, start: null, last: 0 };
      for (const s of shifts) {
        if (cur.start === null) cur = { sum: s.value, start: s.startTime, last: s.startTime };
        else if (s.startTime - cur.last <= 1000 && s.startTime - cur.start <= 5000) { cur.sum += s.value; cur.last = s.startTime; }
        else { best = Math.max(best, cur.sum); cur = { sum: s.value, start: s.startTime, last: s.startTime }; }
      }
      best = Math.max(best, cur.sum);
      const h = document.querySelector('h1,h2,h3');
      return {
        cls: Math.round(best * 10000) / 10000,
        shiftCount: shifts.length,
        lcpMs: window.__lcp != null ? Math.round(window.__lcp) : null,
        fontBody: getComputedStyle(document.body).fontFamily,
        fontHeading: h ? getComputedStyle(h).fontFamily : null,
        title: document.title
      };
    });
    results[url] = data;
  } catch (e) {
    results[url] = { error: String(e).slice(0, 300) };
  }
  await ctx.close();
}
await browser.close();

const outFile = new URL('./cls-results.json', import.meta.url).pathname;
const merged = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
merged[label] = results;
writeFileSync(outFile, JSON.stringify(merged, null, 2));
console.log(JSON.stringify({ label, results }, null, 2));
