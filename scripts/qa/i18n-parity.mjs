#!/usr/bin/env node
/**
 * i18n key-parity checker — FI-396 SF-6 T6.2 (no new deps, node >= 18).
 *
 * So sánh key vi <-> en HAI HỆ:
 *   (a) frontend/packages/i18n/src/catalogs/{vi,en}.ts   (export const vi = {...})
 *   (b) frontend/apps/storefront-web/lib/i18n.ts         (COPY module: leaf = { vi, en })
 *
 * Usage: node scripts/qa/i18n-parity.mjs [repo-root]
 * Exit 0 = parity PASS (0 missing keys cả 2 chiều, cả 2 hệ). Exit 1 = FAIL.
 * Value-identical keys (vi === en) được liệt kê riêng để review — không fail.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Strip // line comments and block comments — tôn trọng string literals. */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line | block | squote | dquote | template
  while (i < n) {
    const c = src[i];
    const c2 = src.slice(i, i + 2);
    if (state === 'code') {
      if (c2 === '//') { state = 'line'; i += 2; continue; }
      if (c2 === '/*') { state = 'block'; i += 2; continue; }
      if (c === "'") { state = 'squote'; out += c; i++; continue; }
      if (c === '"') { state = 'dquote'; out += c; i++; continue; }
      if (c === '`') { state = 'template'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += c; } i++; continue; }
    if (state === 'block') { if (c2 === '*/') { state = 'code'; out += ' '; i += 2; continue; } i++; continue; }
    // inside string: giữ nguyên, thoát theo backslash
    out += c;
    if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
    if ((state === 'squote' && c === "'") || (state === 'dquote' && c === '"') || (state === 'template' && c === '`')) state = 'code';
    i++;
  }
  return out;
}

/** Extract object literal của `const NAME = {` (bỏ TS annotation) bằng balanced-brace scan. */
function extractObject(srcClean, name) {
  const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*\\{`);
  const m = re.exec(srcClean);
  if (!m) throw new Error(`Không tìm thấy 'const ${name} = {'`);
  let depth = 0;
  let start = m.index + m[0].length - 1; // vị trí '{'
  for (let i = start; i < srcClean.length; i++) {
    const c = srcClean[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return srcClean.slice(start, i + 1); }
  }
  throw new Error(`Không tìm thấy '}' đóng cho ${name}`);
}

function evalObject(literal) {
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict"; return (${literal});`)();
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out);
    else out[path] = v;
  }
  return out;
}

function diff(viMap, enMap) {
  const vi = new Set(Object.keys(viMap));
  const en = new Set(Object.keys(enMap));
  return {
    missingInEn: [...vi].filter((k) => !en.has(k)).sort(),
    missingInVi: [...en].filter((k) => !vi.has(k)).sort(),
  };
}

function reportSystem(name, viMap, enMap) {
  const { missingInEn, missingInVi } = diff(viMap, enMap);
  const identical = Object.keys(viMap)
    .filter((k) => k in enMap && viMap[k] === enMap[k])
    .sort();
  console.log(`\n=== ${name} ===`);
  console.log(`keys vi: ${Object.keys(viMap).length} · keys en: ${Object.keys(enMap).length}`);
  console.log(`missing in EN (${missingInEn.length}):`);
  for (const k of missingInEn) console.log(`  - ${k}  (vi="${viMap[k]}")`);
  console.log(`missing in VI (${missingInVi.length}):`);
  for (const k of missingInVi) console.log(`  - ${k}  (en="${enMap[k]}")`);
  console.log(`value-identical vi===en (${identical.length}) — review-only:`);
  for (const k of identical) console.log(`  = ${k}  ("${viMap[k]}")`);
  return missingInEn.length + missingInVi.length;
}

let failures = 0;

// ── Hệ (a): @ecommerce/i18n catalogs ─────────────────────────────────────────
for (const locale of ['vi', 'en']) {
  const p = join(root, `frontend/packages/i18n/src/catalogs/${locale}.ts`);
  // sanity: file phải tồn tại (nếu đổi path thì fail rõ)
  readFileSync(p, 'utf8');
}
const viSrc = stripComments(readFileSync(join(root, 'frontend/packages/i18n/src/catalogs/vi.ts'), 'utf8'));
const enSrc = stripComments(readFileSync(join(root, 'frontend/packages/i18n/src/catalogs/en.ts'), 'utf8'));
const viCat = flatten(evalObject(extractObject(viSrc, 'vi')));
const enCat = flatten(evalObject(extractObject(enSrc, 'en')));
failures += reportSystem('@ecommerce/i18n (packages/i18n catalogs)', viCat, enCat);

// ── Hệ (b): storefront COPY module (lib/i18n.ts) ─────────────────────────────
const sfSrc = stripComments(readFileSync(join(root, 'frontend/apps/storefront-web/lib/i18n.ts'), 'utf8'));
// Quét MỌI `const NAME = {` (kể cả tên thường: `dictionaries`) rồi walk đệ quy:
//  - node có CẢ vi & en là string → leaf {vi,en} (shape dictionaries)
//  - node có vi & en là OBJECT → shape transpose (COPY cũ: Record<Locale,{…}>)
const declRe = /(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*\{/g;
let sfFailures = 0;
let sfChecked = 0;
const viSf = {};
const enSf = {};
function collect(obj, path) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return;
  const hasVi = Object.prototype.hasOwnProperty.call(obj, 'vi');
  const hasEn = Object.prototype.hasOwnProperty.call(obj, 'en');
  if (hasVi && hasEn) {
    if (typeof obj.vi === 'string' && typeof obj.en === 'string') {
      viSf[path] = obj.vi;
      enSf[path] = obj.en;
      sfChecked++;
      return;
    }
    if (obj.vi && obj.en && typeof obj.vi === 'object' && typeof obj.en === 'object') {
      // transpose: {vi:{k:...}, en:{k:...}} — key chung 2 phía
      const viKeys = new Set(Object.keys(obj.vi));
      const enKeys = new Set(Object.keys(obj.en));
      for (const k of new Set([...viKeys, ...enKeys])) {
        if (!(viKeys.has(k) && enKeys.has(k))) {
          viSf[`${path}.${k}`] = viKeys.has(k) ? '(object)' : undefined;
          enSf[`${path}.${k}`] = enKeys.has(k) ? '(object)' : undefined;
          sfChecked++;
          continue;
        }
        if (typeof obj.vi[k] === 'string' && typeof obj.en[k] === 'string') {
          viSf[`${path}.${k}`] = obj.vi[k];
          enSf[`${path}.${k}`] = obj.en[k];
          sfChecked++;
        }
      }
      return;
    }
  }
  for (const [k, v] of Object.entries(obj)) collect(v, path ? `${path}.${k}` : k);
}
for (const m of sfSrc.matchAll(declRe)) {
  let obj;
  try { obj = evalObject(extractObject(sfSrc, m[1])); } catch { continue; }
  collect(obj, m[1]);
}
if (sfChecked === 0) {
  console.log('\n=== storefront COPY (lib/i18n.ts) ===\nKHÔNG parse được entry {vi,en} nào — parser cần cập nhật!');
  sfFailures = 1;
} else {
  sfFailures += reportSystem(`storefront-web COPY (lib/i18n.ts, ${sfChecked} keys)`, viSf, enSf);
}

console.log(`\n=== VERDICT ===`);
console.log(`@ecommerce/i18n missing: xem trên · storefront COPY missing: ${sfFailures > 0 ? 'có missing hoặc parse lỗi' : '0'}`);
if (failures > 0 || sfFailures > 0) {
  console.log('PARITY: FAIL');
  process.exit(1);
}
console.log('PARITY: PASS (0 key missing vi<->en cả 2 hệ)');
