#!/usr/bin/env node
/**
 * rbac-matrix.mjs — SF-1 qa-static-audit (FI-405) — executor B (T8).
 *
 * RBAC expected matrix ĐÓNG (A8): static scan
 *   1. SecurityConfigs (hasRole/hasAuthority requestMatchers + anyRequest)
 *   2. @PreAuthorize của controllers
 *   3. 12 admin controllers (@*Mapping paths — closed list, không "...")
 * Row = endpoint admin (service + method + path) × 3 cột role EXPECTED:
 *   guest → 401 · user → 403 · admin → 2xx.
 * Controller/annotation scanner KHÔNG map được → GAP finding `RBAC-xx`
 * (A11 deterministic) — KHÔNG BAO GIỜ silent skip. Public paths điểm danh
 * (roll-call permitAll per service) kèm theo.
 *
 * Exit semantics: 0 = 0 unfixed finding · 1 = ≥1 (GAP) · 2 = script error.
 * node >= 18 stdlib ONLY · KHÔNG HTTP · KHÔNG docker · KHÔNG đọc .env.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..', '..');

// A8 — 12 admin controllers (closed list — epic §2.8 superset). Thiếu cái nào
// trong scan → GAP (drift: controller mới/xóa mà matrix không theo).
const EXPECTED_ADMIN_CONTROLLERS = [
  'catalog-service/AdminProductController',
  'catalog-service/AdminCategoryController',
  'catalog-service/AdminReviewController',
  'ordering-service/AdminCouponController',
  'ordering-service/AdminOrderController',
  'ordering-service/AdminRmaController',
  'inventory-service/AdminStockController',
  'log-service/AdminEventController',
  'identity-service/AdminNewsletterController',
  'identity-service/AdminUserController',
  'affiliate-service/AdminAffiliateController',
  'affiliate-service/LoyaltyMeAdminController',
];

function fail(msg) {
  console.error(`rbac-matrix: FAIL-LOUD: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    backend: join(REPO, 'backend'),
    report: join(REPO, 'docs', 'superpowers', 'qa', 'report-sf1.md'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = (name) => {
      if (a !== name) return false;
      const v = argv[++i];
      if (v == null) fail(`flag ${name} cần giá trị`);
      return v;
    };
    let v;
    if ((v = take('--backend'))) opts.backend = resolve(v);
    else if ((v = take('--report'))) opts.report = resolve(v);
    else fail(`flag không nhận dạng: '${a}' (hỗ trợ: --backend --report)`);
  }
  return opts;
}

function walkJava(dir, out = []) {
  if (!existsSync(dir)) return out;
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); }
  catch (e) { fail(`Không đọc được dir '${dir}': ${e.message}`); }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'target') walkJava(p, out); }
    else if (e.name.endsWith('.java')) out.push(p);
  }
  return out;
}

function moduleOf(backendDir, file) {
  const parts = relative(backendDir, file).split(sep);
  if (parts[0] === 'services') return parts[1] || null;
  if (parts[0] === 'gateway') return 'gateway';
  return null;
}

// Ant matcher — Spring semantics: '/foo/**' khớp cả '/foo' (0 segment).
function antToRegex(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (pattern.startsWith('**', i)) {
      if (re.endsWith('/')) { re = re.slice(0, -1); re += '(?:/.*)?'; }
      else re += '.*';
      i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '.';
    else if (c === '{') { re += '[^/]+'; i = pattern.indexOf('}', i); if (i === -1) fail(`pattern {var} không đóng: ${pattern}`); }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// ── SecurityConfig rules (service-side, document order) ───────────────────────
function parseSecurityGuards(backendDir) {
  const guards = new Map();
  for (const f of walkJava(join(backendDir, 'services')).concat(walkJava(join(backendDir, 'gateway')))) {
    if (!f.includes(`${sep}src${sep}main${sep}java${sep}`)) continue;
    if (!f.split(sep).at(-1).endsWith('SecurityConfig.java')) continue;
    const svc = moduleOf(backendDir, f);
    const lines = readFileSync(f, 'utf8').split('\n');
    const rules = [];
    let buf = null;
    for (let ln = 0; ln < lines.length; ln++) {
      const line = lines[ln];
      if (buf == null) {
        if (/\.requestMatchers\s*\(/.test(line)) {
          const methods = [...line.matchAll(/HttpMethod\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g)].map((m) => m[1]);
          buf = { methods: methods.length ? methods : null, patterns: [], startLine: ln + 1, text: line };
        } else if (/\.anyRequest\s*\(\s*\)\s*\.\s*(\w+)\s*\(/.test(line)) {
          const g = line.match(/\.anyRequest\s*\(\s*\)\s*\.\s*(\w+)\s*\(/);
          rules.push({ methods: null, patterns: ['**'], guard: g[1], line: ln + 1 });
        }
      } else buf.text += '\n' + line;
      if (buf != null && /\)\s*\.\s*(permitAll|hasRole|hasAuthority|authenticated|denyAll|access)\s*\(/.test(line)) {
        for (const m of buf.text.matchAll(/"([^"]+)"/g)) buf.patterns.push(m[1]);
        const g = line.match(/\.\s*(permitAll|hasRole|hasAuthority|authenticated|denyAll|access)\s*\(\s*([^)]*)\s*\)/);
        rules.push({ methods: buf.methods, patterns: buf.patterns, guard: g[1], guardArg: g[2], line: buf.startLine });
        buf = null;
      }
    }
    if (buf != null) fail(`${relative(REPO, f)}: requestMatchers mở không đóng — fail-loud`);
    guards.set(svc, rules);
  }
  return guards;
}

// ── Controllers + @PreAuthorize → endpoints ───────────────────────────────────
const ANNOT_STR_RE = /@(?:[A-Za-z]*Mapping)\s*(?:\(([^)]*)\))?/;
const MAPPING_LINE_RE = /@(Get|Post|Put|Patch|Delete|Request)Mapping/;
const PREAUTH_RE = /@PreAuthorize\s*\(\s*"([^"]*)"\s*\)/;

// Expression @PreAuthorize hợp lệ scanner hiểu tĩnh — ngoài bảng → GAP.
const KNOWN_AUTHZ = /hasRole\s*\(\s*['"]([^'"]+)['"]\s*\)|hasAuthority\s*\(\s*['"]([^'"]+)['"]\s*\)|hasAnyRole\s*\(([^)]*)\)|isAuthenticated\s*\(\s*\)|permitAll\s*\(\s*\)|isAnonymous\s*\(\s*\)|denyAll\s*\(\s*\)/g;

function extractEndpoints(backendDir) {
  const endpoints = [];
  const gaps = [];
  const files = walkJava(join(backendDir, 'services')).filter((f) => f.includes(`${sep}src${sep}main${sep}java${sep}`));
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (!/@RestController/.test(text)) continue;
    const svc = moduleOf(backendDir, f);
    const cls = f.split(sep).at(-1).replace(/\.java$/, '');
    const lines = text.split('\n');
    // class-level @RequestMapping — occurrence ĐẦU TIÊN trước 'class ';
    // ghi lại dòng khai báo class để method-loop KHÔNG match lại annotation
    // class-level (tránh phantom endpoint 'ANY classPath+classPath').
    let classPath = '';
    let classLine = 0;
    for (let ln = 0; ln < lines.length; ln++) {
      if (/\b(class|interface)\s/.test(lines[ln])) { classLine = ln; break; }
      // KHÔNG break ở @RequestMapping — phải quét tiếp tới dòng class để set
      // classLine (nếu break sớm, method-loop quét từ 0 và class-level
      // @RequestMapping thành phantom endpoint 'ANY classPath+classPath').
      if (classPath === '') {
        const m = lines[ln].match(/@RequestMapping\s*(?:\(([^)]*)\))?/);
        if (m) {
          const s = (m[1] || '""').match(/"([^"]*)"/);
          classPath = s ? s[1] : '';
        }
      }
    }
    // Pairing @PreAuthorize ↔ mapping HAI chiều (2 style trong repo):
    //   (a) @PreAuthorize TRƯỚC @Mapping (chuẩn Spring — đa số controller)
    //   (b) @Mapping TRƯỚC @PreAuthorize (LoyaltyMeAdminController)
    // Preauth không Consumed bởi mapping nào → GAP pre-no-map (không silent).
    const consumed = new Set();
    const preBefore = (from, to) => {
      let found = null;
      for (let i = from; i < to; i++) {
        if (consumed.has(i)) continue;
        const t = (lines[i] || '').trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        const pm = (lines[i] || '').match(PREAUTH_RE);
        if (pm) { found = { expr: pm[1], line: i + 1, idx: i }; }
      }
      return found;
    };
    const preAfter = (from, to) => {
      // chạy các dòng annotation NGAY SAU mapping — dừng khi hết '@' hoặc gặp method body
      for (let i = from; i < to && i < lines.length; i++) {
        const t = lines[i].trim();
        if (t === '' || t.startsWith('//') || t.startsWith('*')) { if (t.startsWith('*')) continue; continue; }
        if (!t.startsWith('@')) break;
        if (consumed.has(i)) continue;
        const pm = lines[i].match(PREAUTH_RE);
        if (pm) return { expr: pm[1], line: i + 1, idx: i };
        if (MAPPING_LINE_RE.test(lines[i])) break; // mapping kế — không ăn vượt
      }
      return null;
    };
    for (let ln = classLine; ln < lines.length; ln++) {
      const t = lines[ln].trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      if (!MAPPING_LINE_RE.test(lines[ln]) || !ANNOT_STR_RE.test(lines[ln])) continue;
      const mm = lines[ln].match(MAPPING_LINE_RE);
      const httpVerb = mm[1] === 'Request' ? 'ANY' : mm[1].toUpperCase();
      const argText = (lines[ln].match(ANNOT_STR_RE)[1]) || '';
      const sv = argText.match(/"([^"]*)"/);
      const sub = sv ? sv[1] : '';
      const path = (classPath + sub) || '/';
      // preauth TRƯỚC mapping (từ cuối class-decl / mapping trước) — lấy GẦN nhất
      const before = preBefore(classLine, ln);
      const after = preAfter(ln + 1, ln + 6);
      const chosen = before || after;
      if (chosen) consumed.add(chosen.idx);
      endpoints.push({
        service: svc, controller: cls, method: httpVerb, path,
        preAuth: chosen, file: relative(REPO, f), line: ln + 1,
      });
    }
    // @PreAuthorize treo KHÔNG map vào mapping nào → GAP (never silent skip)
    for (let i = classLine; i < lines.length; i++) {
      if (consumed.has(i)) continue;
      const t = (lines[i] || '').trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      const pm = (lines[i] || '').match(PREAUTH_RE);
      if (pm)
        gaps.push({ service: svc, kind: 'pre-no-map', detail: `@PreAuthorize("${pm[1]}") không map được vào @*Mapping nào`, file: relative(REPO, f), line: i + 1 });
    }
  }
  return { endpoints, gaps };
}

// Phân loại expression @PreAuthorize: { admin: bool, known: bool, roles: [] }
function classifyPreAuth(expr) {
  const roles = [];
  let m;
  const re = /hasRole\s*\(\s*['"]([^'"]+)['"]\s*\)|hasAuthority\s*\(\s*['"]([^'"]+)['"]\s*\)|hasAnyRole\s*\(([^)]*)\)|isAuthenticated\s*\(\s*\)|permitAll\s*\(\s*\)|isAnonymous\s*\(\s*\)|denyAll\s*\(\s*\)/g;
  let consumed = '';
  let admin = false;
  while ((m = re.exec(expr)) !== null) {
    consumed += m[0];
    const role = m[1] || m[2] ||
      (m[3] ? m[3].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean).join('|') : null);
    if (role) {
      roles.push(role);
      if (role.split('|').includes('ADMIN')) admin = true;
    }
  }
  const residual = expr.replace(consumed, '').replace(/[!\s()&|]/g, '');
  return { admin, known: residual === '', roles };
}

// ── main ──────────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const guards = parseSecurityGuards(opts.backend);
  const { endpoints, gaps } = extractEndpoints(opts.backend);

  console.log(`== rbac-matrix: closed list (A8) ==`);
  console.log(`   SecurityConfig: ${guards.size} services · endpoints scan: ${endpoints.length} · GAP thô: ${gaps.length}\n`);

  // Row = endpoint ADMIN: @PreAuthorize ADMIN hoặc SecurityConfig hasRole-ADMIN
  const adminRows = [];
  const otherPre = []; // @PreAuthorize KHÔNG admin — bảng phụ (đóng list)
  const seenPre = new Set();
  for (const e of endpoints) {
    let isAdmin = false, guardSrc = null;
    if (e.preAuth) {
      const c = classifyPreAuth(e.preAuth.expr);
      const key = `${e.file}:${e.preAuth.line}`;
      seenPre.add(key);
      if (!c.known)
        gaps.push({ service: e.service, kind: 'pre-unparse', detail: `@PreAuthorize("${e.preAuth.expr}") expression ngoài bảng KNOWN_AUTHZ — không map tĩnh được`, file: e.file, line: e.preAuth.line });
      if (c.admin) { isAdmin = true; guardSrc = `@PreAuthorize:${e.preAuth.line}`; }
      else otherPre.push({ ...e, expr: e.preAuth.expr, roles: c.roles });
    }
    if (!isAdmin) {
      const rules = guards.get(e.service) || [];
      const rule = rules.find((r) =>
        (r.guard === 'hasRole' || r.guard === 'hasAuthority') &&
        (r.guardArg || '').includes('ADMIN') &&
        (r.methods == null || r.methods.includes(e.method) || e.method === 'ANY') &&
        r.patterns.some((p) => antToRegex(p).test(e.path)));
      if (rule) { isAdmin = true; guardSrc = `SecurityConfig:${rule.line}`; }
    }
    if (isAdmin) adminRows.push({ ...e, guardSrc });
  }

  // Drift 1 — 12 admin controllers kỳ vọng phải đủ (closed list A8);
  // controller NGOÀI list vẫn vào matrix (superset A8) — chỉ đếm extra.
  const found = new Set(adminRows.map((r) => `${r.service}/${r.controller}`));
  const expectedHit = EXPECTED_ADMIN_CONTROLLERS.filter((e) => found.has(e)).length;
  const extras = [...found].filter((c) => !EXPECTED_ADMIN_CONTROLLERS.includes(c));
  for (const exp of EXPECTED_ADMIN_CONTROLLERS)
    if (!found.has(exp))
      gaps.push({ service: exp.split('/')[0], kind: 'controller-missing', detail: `admin controller kỳ vọng '${exp}' không có endpoint ADMIN nào trong scan — drift closed list`, file: '—', line: 0 });

  // Drift 2 — rule hasRole-ADMIN SecurityConfig mà 0 endpoint khớp → blind spot
  for (const [svc, rules] of guards) {
    for (const r of rules) {
      if ((r.guard !== 'hasRole' && r.guard !== 'hasAuthority') || !(r.guardArg || '').includes('ADMIN')) continue;
      const hit = endpoints.some((e) =>
        (r.methods == null || r.methods.includes(e.method) || e.method === 'ANY') &&
        r.patterns.some((p) => antToRegex(p).test(e.path)));
      if (!hit)
        gaps.push({ service: svc, kind: 'rule-no-endpoint', detail: `SecurityConfig hasRole-ADMIN rule (dòng ${r.line}, ${r.patterns.join(', ')}) không khớp endpoint nào — scanner blind-spot hoặc rule chết`, file: `SecurityConfig ${svc}`, line: r.line });
    }
  }

  // ID deterministic A11 — sort (service, kind, detail)
  gaps.sort((a, b) => a.service.localeCompare(b.service) || a.kind.localeCompare(b.kind) || a.detail.localeCompare(b.detail));
  gaps.forEach((g, i) => { g.id = `RBAC-${String(i + 1).padStart(2, '0')}`; });

  // sắp rows ổn định
  adminRows.sort((a, b) => a.service.localeCompare(b.service) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  for (const r of adminRows)
    console.log(`   ${r.service.padEnd(20)} ${r.method.padEnd(7)} ${r.path.padEnd(46)} ${r.controller} (${r.guardSrc})${process.env.RBAC_DEBUG ? ' @' + r.line : ''}`);
  if (otherPre.length) {
    console.log(`\n   @PreAuthorize KHÔNG admin (đóng list):`);
    for (const r of otherPre)
      console.log(`   ${r.service.padEnd(20)} ${r.method.padEnd(7)} ${r.path.padEnd(46)} → ${r.expr}`);
  }
  for (const g of gaps) console.log(`   [GAP] ${g.id} ${g.kind} — ${g.detail}`);
  console.log(`\n   admin rows: ${adminRows.length} · expected controllers: ${expectedHit}/${EXPECTED_ADMIN_CONTROLLERS.length}${extras.length ? ` (+${extras.length} extra: ${extras.join(', ')})` : ''} · GAP: ${gaps.length}`);

  // public paths roll-call (permitAll matchers per service)
  const rollcall = [];
  for (const svc of [...guards.keys()].sort()) {
    const pats = (guards.get(svc) || []).filter((r) => r.guard === 'permitAll')
      .flatMap((r) => r.patterns);
    if (pats.length) rollcall.push([svc, trunc(pats.join(' · '), 150)]);
  }

  // exit semantics
  const exitCode = gaps.length > 0 ? 1 : 0;

  // ── report marker sf1:rbac ──
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const matrixRows = adminRows.map((r) => [
    r.service, `${r.method} ${r.path}`, r.controller, r.guardSrc,
    '401', '403', '2xx',
  ]);
  const otherRows = otherPre.map((r) => [r.service, `${r.method} ${r.path}`, trunc(r.expr, 60), '—']);
  const gapRows = gaps.map((g) => [g.id, g.kind, trunc(g.detail, 120), trunc(`${g.file}:${g.line}`, 50)]);
  const rollRows = rollcall;
  const content = [
    `### RBAC expected matrix — closed list (A8)`,
    '',
    `Run ${now} — static scan ${guards.size} SecurityConfig + @PreAuthorize + controllers. **${adminRows.length} endpoint ADMIN** (12 controllers kỳ vọng: ${expectedHit}/${EXPECTED_ADMIN_CONTROLLERS.length} thấy${extras.length ? ` + ${extras.length} extra ngoài list: ${extras.join(', ')}` : ''}) × 3 cột EXPECTED: guest→401 · user→403 · admin→2xx. Đóng list — không "...".`,
    '',
    `**Matrix admin (${adminRows.length} endpoint) — cell = EXPECTED:**`,
    '',
    mdTable(['service', 'endpoint', 'controller', 'guard nguồn', 'guest', 'user', 'admin'], matrixRows),
    '',
    `**@PreAuthorize KHÔNG admin** (đóng list, ${otherPre.length} — EXPECTED: tuỳ expression, guest/user 2xx nếu permitAll/anonymous):`,
    '',
    mdTable(['service', 'endpoint', 'expression', 'ghi chú'], otherRows.length ? otherRows : [['—', '—', '—', '0']]),
    '',
    `**Public paths điểm danh (permitAll per SecurityConfig):**`,
    '',
    mdTable(['service', 'permitAll patterns'], rollRows),
    '',
    `**Findings GAP (RBAC-xx — A11):**`,
    '',
    mdTable(['ID', 'kind', 'chi tiết', 'evidence'], gapRows.length ? gapRows : [['—', '—', '0 GAP', '—']]),
    '',
    `**Exit rbac-matrix: \`${exitCode}\`** — legend: 0 = 0 finding CHƯA fix · 1 = ≥1 finding · 2 = script error. Static EXPECTED — live execute là harness SF-2 + triage SF-4.`,
  ].join('\n');
  upsertSection(opts.report, 'rbac', content);

  console.log(`\n== rbac-matrix EXIT=${exitCode} — admin rows ${adminRows.length}, GAP ${gaps.length} ==`);
  console.log(`   report: ${relative(REPO, opts.report)} — regen marker sf1:rbac (block khác giữ nguyên)`);
  return exitCode;
}

// ── Report writer (marker sf1:rbac — pattern chung config-audit) ──────────────
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function upsertSection(reportPath, section, content) {
  let text;
  if (existsSync(reportPath)) text = readFileSync(reportPath, 'utf8');
  else fail(`Report không tồn tại: ${reportPath} (chạy config-audit.mjs trước để có skeleton)`);
  const open = `<!-- sf1:${section} -->`;
  const close = `<!-- /sf1:${section} -->`;
  const re = new RegExp(`${escRe(open)}[\\s\\S]*?${escRe(close)}`);
  if (!re.test(text)) fail(`Marker '${open}' không có trong report — KHÔNG tự append (skeleton sai schema)`);
  writeFileSync(reportPath, text.replace(re, `${open}\n${content}\n${close}`));
}
const mdTable = (header, rows) => [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
].join('\n');
const trunc = (s, n = 60) => (s == null ? '—' : String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

try { process.exit(main()); } catch (e) {
  console.error(`rbac-matrix: LỖI script (exit 2): ${e && e.stack ? e.stack : e}`);
  process.exit(2);
}
