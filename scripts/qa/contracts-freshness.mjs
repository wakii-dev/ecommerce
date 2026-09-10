#!/usr/bin/env node
/**
 * contracts-freshness.mjs — SF-1 qa-static-audit (FI-405) — executor C (T11).
 *
 * Probe TĨNH độ tươi contract (A12) — FINDING-ONLY, KHÔNG TỰ SỬA contracts/
 * hay controller (fix = SF-4 qua finding):
 *   parse `contracts/openapi/*.yaml` (paths + methods, line-level — A9,
 *   KHÔNG yaml lib) ↔ controller `@*Mapping` (class-level @RequestMapping
 *   prefix + method-level @GetMapping/@PostMapping/...) per backend module.
 *   Stale CẢ 2 CHIỀU → finding `CT-xx` (deterministic, service-scoped — A11):
 *     - STALE-SPEC: spec-op không có controller nào map route tương ứng.
 *     - STALE-CTRL: controller route không có spec-op nào khai báo.
 *
 * Chuẩn hóa path trước so khớp (constants có evidence, xem dưới):
 *   - STRIP_PREFIX theo gateway-routes.yml (predicate + StripPrefix filter —
 *     spec yaml ghi path GATEWAY-facing `/api/ordering/...` còn controller
 *     ghi path SERVICE-side `/orders`).
 *   - `{param}` chuẩn hóa về `{*}` — Spring match theo VỊ TRÍ segment,
 *     không theo tên biến (vd spec `/products/{id}` ↔ ctrl `/products/{idOrSlug}`
 *     = CÙNG op, chỉ lệch tên — KHÔNG stale; stale chỉ khi op thiếu hẳn).
 *   - Ignore-list non-API (actuator/swagger/v3/api-docs/internal/error) áp
 *     CẢ 2 PHÍA nhất quán.
 *
 * Map CONSTANT (A12): `invoice.yaml` → ordering-service (invoice controllers
 * sống trong ordering-service — KHÔNG có module invoice-service trong
 * backend/; note: /api/invoice/generate thực tế do invoice-service Python
 * :8090 serve ngoài backend/ — probe chỉ scan Java @*Mapping → op bị bỏ qua
 * qua IGNORE_SEGMENTS segment 'generate' (CT-23, SF-4/FI-408), không tự suy diễn).
 *
 * Exit semantics: 0 = 0 finding CHƯA fix · 1 = ≥1 finding (CT-xx) ·
 * 2 = script error (fail-loud — shape yaml/controller không parse được).
 *
 * node >= 18 stdlib ONLY. KHÔNG ĐỌC .env. KHÔNG HTTP/docker/runtime — static
 * file reads. Không emit GIÁ TRỊ env nào (chỉ route path) — chuỗi emit khớp
 * /PASS|SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE/i bị thay «masked» (policy
 * chung, defense-in-depth).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..', '..');

// ── Hằng số chia sẻ ──────────────────────────────────────────────────────────
const SECRET_RE = /PASS|SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE/i;
const mask = (s) => (SECRET_RE.test(String(s)) ? '«masked»' : s);

// A12 — map yaml → backend module (CONSTANT). `invoice` → ordering-service:
// không có dir invoice-service trong backend/ (renderer Python ngoài backend/).
const YAML_TO_MODULE = new Map([
  ['affiliate', 'affiliate-service'], ['cart', 'cart-service'],
  ['catalog', 'catalog-service'], ['identity', 'identity-service'],
  ['inventory', 'inventory-service'], ['invoice', 'ordering-service'],
  ['notification', 'notification-service'], ['ordering', 'ordering-service'],
  ['partner-api', 'partner-api'], ['payment', 'payment-service'],
]);

// Số segment gateway strip khi forward (gateway-routes.yml — evidence):
//   identity StripPrefix=2 (:36) · ordering StripPrefix=2 (:77) — strip cả
//   `/api/<service>`; inventory StripPrefix=1 (:70) · payment StripPrefix=1
//   (:81) — chỉ strip `/api`; catalog/cart/affiliate/notification/partner-api
//   KHÔNG StripPrefix (controller map full path, comment ngay trong
//   gateway-routes.yml); invoice KHÔNG có gateway route (s2s gọi thẳng
//   invoice-service Python) → strip 0.
const STRIP_PREFIX = new Map([
  ['affiliate', 0], ['cart', 0], ['catalog', 0], ['identity', 2],
  ['inventory', 1], ['invoice', 0], ['notification', 0], ['ordering', 2],
  ['partner-api', 0], ['payment', 1],
]);

// Ignore-list non-API path (constant, áp CẢ 2 PHÍA spec lẫn controller —
// endpoint hạ tầng/không thuộc hợp đồng API công khai: actuator health,
// swagger docs, internal s2s (đã phủ ở s2s-auth-matrix), error page).
const IGNORE_SEGMENTS = ['actuator', 'swagger', 'swagger-ui', 'swagger-ui.html', 'v3', 'error', 'internal', 'generate']; // CT-23 — invoice renderer Python (services/invoice-service/, ngoài backend/) — probe chỉ scan Java; blind-spot vô hạn + op này có thật ở runtime (s2s matrix row HttpInvoiceProvider). Segment 'generate' surgical — KHÔNG ignore cả 'invoice'.
const isIgnoredPath = (p) => p.split('/').some((seg) => IGNORE_SEGMENTS.includes(seg));

// Module SCOPE của probe = các module CÓ yaml (YAML_TO_MODULE values).
// log-service / template-service / gateway KHÔNG có contract yaml → ngoài
// scope probe (không có hợp đồng nào để stale — ghi rõ trong report).

// OpenAPI method-level keys nhận diện (verbs chuẩn OpenAPI 3).
const SPEC_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

// Controller annotations nhận diện (method-level).
const METHOD_ANN_RE = /^@(Get|Post|Put|Patch|Delete)Mapping\b\s*(?:\((.*)\))?\s*$/;
const METHOD_ANN_PREFIX = /^@(?:Get|Post|Put|Patch|Delete)Mapping\b/;

function fail(msg) {
  console.error(`contracts-freshness: FAIL-LOUD: ${msg}`);
  process.exit(2);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    contracts: join(REPO, 'contracts', 'openapi'),
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
    if ((v = take('--contracts'))) opts.contracts = resolve(v);
    else if ((v = take('--backend'))) opts.backend = resolve(v);
    else if ((v = take('--report'))) opts.report = resolve(v);
    else fail(`flag không nhận dạng: '${a}' (hỗ trợ: --contracts --backend --report)`);
  }
  return opts;
}

// ── Chuẩn hóa path ───────────────────────────────────────────────────────────
// Strip N segment đầu (gateway-facing → service-side). `/api/identity/auth/x`
// strip 2 → `/auth/x`. Ít segment hơn N → fail-loud (shape không hợp lệ).
function stripSegments(path, n) {
  const segs = path.split('/').filter((s) => s.length > 0);
  if (segs.length < n) fail(`path '${path}' có ít hơn ${n} segment để strip`);
  const rest = segs.slice(n);
  return '/' + rest.join('/');
}

// `{param}` → `{*}` — match theo vị trí segment (Spring không match theo tên
// biến). Gộp `//` và bỏ trailing `/` (trừ root).
const normPath = (p) =>
  p.replace(/\{[^/{}]*\}/g, '{*}').replace(/\/{2,}/g, '/').replace(/(.+)\/$/, '$1');

// prefix class-level + suffix method-level → route service-side
function joinRoute(prefix, suffix) {
  if (!prefix) return suffix || '/';
  if (!suffix) return prefix;
  return prefix.endsWith('/') ? prefix + suffix.replace(/^\//, '') : prefix + suffix;
}

// ── Parse spec yaml (line-level, A9 — fail-loud khi shape lạ) ────────────────
// Shape hỗ trợ: `paths:` cột 0; path key `  /...:` indent 2; method key
// `    (verb):` indent 4 (tuỳ chọn `#comment` cuối dòng). Top-level key kế
// tiếp (indent 0, không phải comment) kết thúc section paths.
function parseSpecYaml(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const paths = new Map(); // path → [{method, line}]
  let inPaths = false;
  let curPath = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.replace(/\s+$/, '');
    if (/^paths:\s*(#.*)?$/.test(t)) { inPaths = true; curPath = null; continue; }
    if (!inPaths) continue;
    if (/^[^ #\s][^:]*:\s*(#.*)?$/.test(t)) { inPaths = false; curPath = null; continue; }
    const pm = t.match(/^  (\/\S*):\s*(#.*)?$/);
    if (pm) { curPath = pm[1]; if (!paths.has(curPath)) paths.set(curPath, []); continue; }
    const mm = t.match(/^    ([a-z]+):\s*(#.*)?$/);
    if (mm) {
      if (!SPEC_VERBS.includes(mm[1])) continue; // key 4-indent khác verb (vd `parameters:`) — bỏ qua an toàn
      if (!curPath) fail(`${relative(REPO, file)}:${i + 1}: method '${mm[1]}' nằm ngoài path key — shape OpenAPI không hỗ trợ`);
      paths.get(curPath).push({ method: mm[1].toUpperCase(), line: i + 1 });
      continue;
    }
  }
  if (paths.size === 0)
    fail(`${relative(REPO, file)}: không tìm thấy section paths:/path key nào (shape OpenAPI không hỗ trợ)`);
  return paths;
}

// ── Parse controller routes per module ───────────────────────────────────────
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

// Trả về Map key chuẩn hóa → {method, path, file, line} (route service-side).
function parseControllerRoutes(backendDir, module) {
  const dir = join(backendDir, 'services', module);
  if (!existsSync(dir)) fail(`Module dir không tồn tại: ${dir} (map YAML_TO_MODULE sai?)`);
  const routes = new Map();
  for (const f of walkJava(dir)) {
    if (!f.includes(`${sep}src${sep}main${sep}java${sep}`)) continue;
    if (!f.split(sep).at(-1).endsWith('Controller.java')) continue;
    const lines = readFileSync(f, 'utf8').split('\n');
    let prefix = null; // null = không có class-level @RequestMapping → route full ở method-level
    let sawMethod = false;
    for (let ln = 0; ln < lines.length; ln++) {
      const t = lines[ln].trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      // class-level @RequestMapping (bare HOẶC 1 string literal)
      if (/^@RequestMapping$/.test(t)) {
        if (sawMethod || prefix !== null) fail(`${relative(REPO, f)}:${ln + 1}: @RequestMapping lệch vị trí/số lượng — shape không hỗ trợ`);
        prefix = ''; continue;
      }
      const rm = t.match(/^@RequestMapping\s*\(\s*"([^"]*)"\s*\)$/);
      if (rm) {
        if (sawMethod || prefix !== null) fail(`${relative(REPO, f)}:${ln + 1}: @RequestMapping lệch vị trí/số lượng — shape không hỗ trợ`);
        prefix = rm[1]; continue;
      }
      if (/^@RequestMapping\s*\(/.test(t))
        fail(`${relative(REPO, f)}:${ln + 1}: @RequestMapping shape không parse được (value không phải 1 string literal) — fail-loud`);
      const mm = t.match(METHOD_ANN_RE);
      if (!mm) {
        // annotation method mở nhưng không đóng trên 1 dòng → fail-loud (A9)
        if (METHOD_ANN_PREFIX.test(t))
          fail(`${relative(REPO, f)}:${ln + 1}: ${t.split('(')[0]} shape không parse được (nhiều dòng / value lạ) — fail-loud`);
        continue;
      }
      sawMethod = true;
      const args = mm[2] || '';
      const pm = args.match(/"([^"]*)"/); // string literal đầu tiên = path (vd value="...", produces=... theo sau)
      const suffix = pm ? pm[1] : '';
      const route = joinRoute(prefix, suffix);
      const key = `${mm[1].toUpperCase()} ${normPath(route)}`;
      const entry = { method: mm[1].toUpperCase(), path: route, file: relative(REPO, f), line: ln + 1 };
      if (routes.has(key)) {
        const ex = routes.get(key);
        fail(`Route trùng ${key}: ${ex.file}:${ex.line} và ${entry.file}:${entry.line} — Spring không cho 2 mapping giống hệt; shape không hỗ trợ`);
      }
      routes.set(key, entry);
    }
  }
  return routes;
}

// ── Report writer — marker-based, idempotent (pattern chung s2s/rbac) ────────
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

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs(process.argv.slice(2));

  // 1) spec ops per module (union các yaml cùng map về 1 module — vd ordering
  //    service: ordering.yaml + invoice.yaml)
  const specByModule = new Map(); // module → Map key → {method, path, yaml, pathLine, yamlFile}
  const cov = []; // coverage per yaml
  for (const [yamlName, module] of YAML_TO_MODULE) {
    const yamlFile = join(opts.contracts, `${yamlName}.yaml`);
    if (!existsSync(yamlFile)) fail(`Contract không tồn tại: ${yamlFile}`);
    const paths = parseSpecYaml(yamlFile);
    const stripN = STRIP_PREFIX.get(yamlName);
    if (!specByModule.has(module)) specByModule.set(module, new Map());
    const acc = specByModule.get(module);
    let ops = 0, ignored = 0;
    for (const [path, methodEntries] of paths) {
      if (isIgnoredPath(path)) { ignored += methodEntries.length; continue; }
      const servicePath = stripSegments(path, stripN);
      for (const me of methodEntries) {
        const key = `${me.method} ${normPath(servicePath)}`;
        ops++;
        if (!acc.has(key)) acc.set(key, { method: me.method, path: servicePath, yaml: yamlName, pathLine: me.line, yamlFile: relative(REPO, yamlFile) });
      }
    }
    cov.push({ yaml: yamlName, module, pathCount: paths.size, ops, ignored });
  }

  // 2) controller ops per module — ignore-list áp CẢ 2 PHÍA (route hạ tầng
  //    như /internal/** không thuộc hợp đồng công khai, không so khớp)
  const ctrlByModule = new Map();
  const ignoredCtrlByModule = new Map();
  let ctrlOpTotal = 0, ignoredCtrlTotal = 0;
  for (const module of new Set(YAML_TO_MODULE.values())) {
    const routes = parseControllerRoutes(opts.backend, module);
    const kept = new Map();
    let ig = 0;
    for (const [key, c] of routes) {
      if (isIgnoredPath(c.path)) { ig++; continue; }
      kept.set(key, c);
    }
    ctrlByModule.set(module, kept);
    ignoredCtrlByModule.set(module, ig);
    ctrlOpTotal += kept.size;
    ignoredCtrlTotal += ig;
  }

  const specOpTotal = cov.reduce((s, c) => s + c.ops, 0);
  const ignoredTotal = cov.reduce((s, c) => s + c.ignored, 0);

  console.log(`== contracts-freshness: openapi paths+methods ↔ @*Mapping controllers (A12) ==`);
  console.log(`   ${YAML_TO_MODULE.size} yaml → ${specByModule.size} module · spec ops: ${specOpTotal} · controller ops: ${ctrlOpTotal} · ignored (spec ${ignoredTotal} · ctrl ${ignoredCtrlTotal})\n`);

  // 3) diff 2 chiều
  const findings = [];
  for (const [module, specOps] of specByModule) {
    const ctrlOps = ctrlByModule.get(module);
    for (const [key, s] of specOps) {
      if (!ctrlOps.has(key))
        findings.push({ dir: 'STALE-SPEC', module, method: s.method, path: s.path,
          note: `spec-op không có controller nào map route (yaml ${s.yaml})`,
          evidence: `${s.yamlFile}:${s.pathLine}`, yaml: s.yaml });
    }
    for (const [key, c] of ctrlOps) {
      if (!specOps.has(key))
        findings.push({ dir: 'STALE-CTRL', module, method: c.method, path: c.path,
          note: `controller route không có spec-op nào khai báo (yaml: ${[...new Set([...specOps.values()].map((s) => s.yaml))].join(', ')})`,
          evidence: `${c.file}:${c.line}`, yaml: [...new Set([...specOps.values()].map((s) => s.yaml))].join('+') });
    }
  }

  // ID deterministic A11: sort (module, dir, method, path) — service-scoped
  findings.sort((a, b) =>
    a.module.localeCompare(b.module) || a.dir.localeCompare(b.dir) ||
    a.method.localeCompare(b.method) || a.path.localeCompare(b.path));
  findings.forEach((f, i) => { f.id = `CT-${String(i + 1).padStart(2, '0')}`; });

  for (const f of findings)
    console.log(`   [${f.id}] ${f.dir} ${f.module} — ${f.method} ${mask(f.path)}\n      ↳ ${f.note} · ${f.evidence}`);
  const staleSpec = findings.filter((f) => f.dir === 'STALE-SPEC').length;
  const staleCtrl = findings.filter((f) => f.dir === 'STALE-CTRL').length;
  console.log(`\n   findings: ${findings.length} (STALE-SPEC=${staleSpec} · STALE-CTRL=${staleCtrl})${findings.length ? ' — ' + findings.map((f) => f.id).join(', ') : ''}`);

  const exitCode = findings.length > 0 ? 1 : 0;

  // ── report marker sf1:contracts ──
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const covRows = cov.map((c) => {
    const fSpec = findings.filter((f) => f.yaml === c.yaml && f.dir === 'STALE-SPEC').length;
    const fCtrl = findings.filter((f) => f.dir === 'STALE-CTRL' && f.module === c.module).length;
    return [`${c.yaml}.yaml`, c.module, String(c.pathCount), String(c.ops), String(c.ignored), String(ignoredCtrlByModule.get(c.module) || 0), String(fSpec), String(fCtrl)];
  });
  const findRows = findings.map((f) => [
    f.id, f.dir, f.module, `${f.method} ${trunc(mask(f.path), 58)}`, trunc(mask(f.note), 88), trunc(f.evidence, 70),
  ]);
  const content = [
    `### Contracts freshness — openapi ↔ controllers (A12)`,
    '',
    `Run ${now} — ${YAML_TO_MODULE.size} yaml ↔ ${specByModule.size} module backend. So khớp **(method, path)** sau chuẩn hóa: strip gateway-prefix theo gateway-routes.yml (identity/ordering StripPrefix=2 · inventory/payment StripPrefix=1 · còn lại 0) · \`{param}\` → \`{*}\` (Spring match theo vị trí segment, không tên biến) · ignore-list non-API áp 2 phía: ${IGNORE_SEGMENTS.join(', ')}.`,
    '',
    `**Findings: ${findings.length}** (STALE-SPEC=${staleSpec} — spec-op không có controller · STALE-CTRL=${staleCtrl} — controller route không có spec-op) → exit **${exitCode}**. FINDING-ONLY — không tự sửa contracts/ hay controller (fix = SF-4).`,
    '',
    `**Chi tiết finding (CT-xx — A11 deterministic, service-scoped):**`,
    '',
    mdTable(['ID', 'chiều', 'module', 'route (service-side)', 'ghi chú', 'evidence'],
      findRows.length ? findRows : [['—', '—', '—', '—', '0 finding', '—']]),
    '',
    `**Coverage per yaml:**`,
    '',
    mdTable(['yaml', 'module', 'path khai báo', 'ops so khớp', 'ignored spec', 'ignored ctrl', 'stale-spec', 'stale-ctrl*'], covRows),
    '',
    `> *stale-ctrl gộp theo MODULE (module nhận union các yaml map vào nó — vd ordering-service: ordering.yaml + invoice.yaml). Map CONSTANT A12: \`invoice.yaml → ordering-service\` (không có module invoice-service trong backend/ — renderer Python :8090 ngoài backend/, probe chỉ scan Java @*Mapping nên op POST /api/invoice/generate được bỏ qua qua IGNORE_SEGMENTS segment 'generate' — CT-23 SF-4/FI-408; runtime cover bởi s2s matrix row HttpInvoiceProvider). Scope: log-service/template-service/gateway không có yaml → ngoài probe. Phương pháp: parse line-level (A9, fail-loud exit 2) — spec: \`paths:\` indent 0, path key indent 2, verb key indent 4; controller: class-level \`@RequestMapping\` + method-level \`@*Mapping\` (chỉ file *Controller.java src/main). Không đọc .env; không emit giá trị env (chuỗi khớp secret-pattern → «masked»).`,
  ].join('\n');
  upsertSection(opts.report, 'contracts', content);

  console.log(`\n== contracts-freshness EXIT=${exitCode} — findings: ${findings.map((f) => f.id).join(', ') || '0'} ==`);
  console.log(`   report: ${relative(REPO, opts.report)} — regen marker sf1:contracts (block khác giữ nguyên)`);
  return exitCode;
}

try { process.exit(main()); } catch (e) {
  console.error(`contracts-freshness: LỖI script (exit 2): ${e && e.stack ? e.stack : e}`);
  process.exit(2);
}
