/**
 * SF-5 probe — /cart blank qua entry :3400: capture network + DOM root.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
const PW = process.env.PW_PATH || '../../frontend/node_modules/playwright/index.mjs';
const { chromium } = await import(new URL(PW, import.meta.url).href);
const ENTRY = process.env.RIG_ENTRY || 'http://localhost:3400';
mkdirSync('.run', { recursive: true });

const browser = await chromium.launch({
  executablePath: '/Users/hoivu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'
});
const page = await (await browser.newContext()).newPage();
const reqs = [];
page.on('response', async (r) => {
  reqs.push({ url: r.url().slice(0, 140), status: r.status(), ct: (r.headers()['content-type'] || '').slice(0, 40) });
});
page.on('requestfailed', (r) => reqs.push({ url: r.url().slice(0, 140), status: 'FAILED', ct: r.failure()?.errorText || '' }));
await page.goto(`${ENTRY}/cart`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const dom = await page.evaluate(() => ({
  title: document.title,
  bodyLen: document.body.innerHTML.length,
  bodySample: document.body.innerHTML.slice(0, 400),
  rootChildren: document.getElementById('root')?.children.length ?? 'no-root'
}));
writeFileSync('.run/sf5-cart-probe.json', JSON.stringify({ dom, reqs: reqs.slice(0, 50) }, null, 2));
console.log(JSON.stringify(dom, null, 2));
console.log('--- requests với status >=400 hoặc FAILED ---');
for (const r of reqs) if (r.status === 'FAILED' || (typeof r.status === 'number' && r.status >= 400)) console.log(r.status, r.url, r.ct);
await browser.close();
