#!/usr/bin/env node
/**
 * Vietnamese hardcode scanner — FI-396 SF-6 T6.1 (no deps).
 * Quét .ts/.tsx ngoài catalogs: strip comment (string-aware) rồi báo dòng còn
 * chữ tiếng Việt (Latin Extended U+00C0-024F + Additional U+1EA0-1EFF).
 * Excludes: __tests__, *.test.*, catalogs (i18n.ts, en.ts, vi.ts, seo.ts COPY),
 * dòng console, dòng import. Kết quả cần review tay (render vs const-data).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [
  'frontend/apps/shell/src',
  'frontend/apps/mfe-checkout/src',
  'frontend/apps/mfe-account/src',
  'frontend/apps/mfe-admin/src',
  'frontend/apps/storefront-web/components',
  'frontend/apps/storefront-web/app',
];
const EXCLUDE_FILE = /(i18n\.ts$|seo\.ts$|catalogs\/(vi|en)\.ts$|\.test\.|__tests__)/;
const VI_RE = /[À-ÿĀ-ɏẠ-ỿ]/;

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|ts)$/.test(e.name)) yield p;
  }
}

function stripCommentsLine(line, state) {
  // trả về [stripped, newState]; state.block = đang trong block comment
  let out = '';
  let i = 0;
  while (i < line.length) {
    const c2 = line.slice(i, i + 2);
    if (state.block) {
      const end = line.indexOf('*/', i);
      if (end === -1) return [out, state];
      i = end + 2;
      state.block = false;
      continue;
    }
    if (c2 === '/*') { state.block = true; i += 2; continue; }
    if (c2 === '//') break; // line comment — cắt phần còn lại
    const q = line[i];
    if (q === '"' || q === "'" || q === '`') {
      // copy nguyên string literal (tôn trọng escape)
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') j += 2;
        else if (line[j] === q) { j++; break; }
        else j++;
      }
      out += line.slice(i, j);
      i = j;
      continue;
    }
    out += q;
    i++;
  }
  return [out, state];
}

const state = { block: false };
const hits = [];
for (const dir of SCAN_DIRS) {
  let dirAbs = join(ROOT, dir);
  try { statSync(dirAbs); } catch { continue; }
  for (const f of walk(dirAbs)) {
    if (EXCLUDE_FILE.test(f)) continue;
    state.block = false; // per file
    const lines = readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const [stripped] = stripCommentsLine(lines[i], state);
      if (!VI_RE.test(stripped)) continue;
      const t = stripped.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      if (/^\s*import\b/.test(t) || /console\./.test(t)) continue;
      hits.push(`${relative(ROOT, f)}:${i + 1}:${stripped.trim()}`);
    }
  }
}
console.log(hits.join('\n'));
console.log(`\nTOTAL: ${hits.length}`);
