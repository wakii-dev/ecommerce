#!/usr/bin/env node
/**
 * s2s-auth-matrix.mjs — SF-1 qa-static-audit (FI-405) — executor B (T6 + T7).
 *
 * Detector TĨNH service-to-service auth (KHÔNG HTTP, KHÔNG docker, KHÔNG .env):
 *   T6 — enumerate MỌI HTTP client service→service path-granularity (A2):
 *        pair := (client class, endpoint path gọi). Base-url resolve qua
 *        @Value / props-hint var (constant map — A3 cho phép) → port →
 *        compose service. Loại trừ A3: infra (ES/MinIO/SMTP/Rabbit) +
 *        third-party (GHN/IdP/partner webhooks).
 *   T7 — verdict EXPECTED per pair (A5): EXPECTED_OK / DANGEROUS / GAP.
 *        Guard đích = SecurityConfig requestMatchers của service ĐÍCH
 *        (service-side path — s2s gọi thẳng port, không qua gateway
 *        StripPrefix). Service KHÔNG SecurityConfig + KHÔNG spring-security
 *        (notification/payment/template, invoice Python) → guard = permitAll
 *        (ghi note — KHÔNG GAP, plan-critic special rule). Drift check:
 *        call-site enumerate ↔ curated matrix rows 1:1 — lệch → GAP.
 *
 * Exit semantics: 0 = 0 finding CHƯA fix · 1 = ≥1 finding (DANGEROUS/GAP) ·
 * 2 = script error (fail-loud). Finding ID `S2S-xx` deterministic (A11).
 *
 * node >= 18 stdlib ONLY. KHÔNG ĐỌC .env. Token: chỉ in TÊN var nguồn +
 * header name — KHÔNG BAO GIỜ in giá trị (var match /PASS|SECRET|TOKEN|…/
 * masked theo policy chung).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..', '..');

// ── Hằng số chia sẻ ──────────────────────────────────────────────────────────
const SECRET_RE = /PASS|SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE/i;

// A3 — map port service ↔ compose service name (constant, dùng khi base-url
// là localhost-family: resolve theo PORT — compose set alias cùng port nên
// destination không đổi). 8090 invoice-service (Python, ngoài backend/).
const PORT_TO_SERVICE = {
  8080: 'gateway', 8081: 'identity-service', 8082: 'catalog-service',
  8083: 'cart-service', 8084: 'inventory-service', 8085: 'ordering-service',
  8086: 'payment-service', 8087: 'notification-service', 8088: 'log-service',
  8090: 'invoice-service', 8091: 'partner-api', 8092: 'affiliate-service',
  8093: 'template-service',
};

// A3 — loại trừ client file KHỎI matrix (constant + lý do, audit trail đầy đủ).
const EXCLUDED_CLIENTS = new Map([
  ['EsEngine.java', 'infra Elasticsearch (A3) — không phải s2s commerce'],
  ['EsIndexConfig.java', 'infra Elasticsearch (A3)'],
  ['SearchEngineConfig.java', 'infra Elasticsearch (A3)'],
  ['GhnClient.java', 'third-party GHN shipping (A3)'],
  ['OAuthProviderClient.java', 'third-party OAuth IdP (Google/Facebook) (A3)'],
  ['WebhookDeliveryService.java', 'third-party partner webhooks — URL ngoài hệ (A3)'],
]);

// Client props-based (không @Value base-url trong file) → var env nguồn
// (constant map — resolve tiếp qua application.yml module: ${VAR:default}).
const PROPS_BASE_HINTS = new Map([
  ['notification-service/IdentityClient.java', 'NOTIFY_IDENTITY_BASE_URL'],
  ['notification-service/InvoiceClient.java', 'ORDERING_BASE_URL'],
  ['notification-service/CatalogStockAlertClient.java', 'NOTIFY_STOCK_ALERT_CATALOG_BASE_URL'],
  ['partner-api/CatalogClient.java', 'PARTNER_CATALOG_BASE_URL'],
  ['partner-api/IdentityClient.java', 'PARTNER_IDENTITY_BASE_URL'],
  ['partner-api/OrderingClient.java', 'PARTNER_ORDERING_BASE_URL'],
]);

// Client file THẬT = file BUILD/USAGE client — file chỉ catch
// RestClientException (OrderLifecycleService, RmaAdminService) KHÔNG phải
// client (call thật thuộc client class được delegate — pair ghi đúng class).
// 2 pattern: tự build (RestClient.builder()) + builder INJECT (RestClient.Builder
// param — pattern chính của ordering/partner/notification clients).
const CLIENT_DEF_RE = /(RestClient|WebClient)\s*\.\s*(builder|create)\s*\(|new\s+RestTemplate\s*\(|RestClient\.Builder|WebClient\.Builder/;
// @Value("${prop:default}") Type identifier — cho resolve uri-by-variable.
const VALUE_PARAM_RE = /@Value\("\$\{([^}"]+)\}"\)\s+(?:final\s+)?(?:String|long|int)\s+(\w+)/g;
// @Value base-url — default URL trong chính annotation.
const VALUE_BASEURL_RE = /@Value\("\$\{([^}"]*base-url):([^}"]*)\}"/;
// `rest.get()` / `rest.post()` — call HTTP (field `rest` thống nhất các client).
const REST_METHOD_RE = /\brest\s*\.\s*(get|post|put|patch|delete|method)\s*\(/;
// helper `get(builder -> ...)` — partner CatalogClient style.
const HELPER_LAMBDA_RE = /\b(get|post|put|patch|delete)\s*\(\s*[a-zA-Z]+\s*->/;
// literal path trong .uri("...") / .path("...") — PHẢI bắt đầu '/' để loại
// JsonNode.path("available") (accessor JSON field, không phải URI builder).
const URI_LITERAL_RE = /\.(?:uri|path)\(\s*"(\/[^"]*)"/;
// uri-by-variable: .uri(byIdPath + productId)
const URI_VARIABLE_RE = /\.(?:uri|path)\(\s*([a-zA-Z_]\w*)\s*\+/;

function fail(msg) {
  console.error(`s2s-auth-matrix: FAIL-LOUD: ${msg}`);
  process.exit(2);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
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

// ── Walk java sources (bỏ target/) ───────────────────────────────────────────
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

// module từ path: backend/services/<dir> → <dir>; backend/gateway → gateway
function moduleOf(backendDir, file) {
  const parts = relative(backendDir, file).split(sep);
  if (parts[0] === 'services') return parts[1] || null;
  if (parts[0] === 'gateway') return 'gateway';
  return null;
}

// ── Yml module: map var-env → default (để resolve props-hint var) ────────────
function loadYmlVarDefaults(backendDir, module) {
  const res = join(backendDir, 'services', module, 'src', 'main', 'resources');
  const map = new Map();
  if (!existsSync(res)) return map;
  const walk = (dir, out = []) => {
    if (!existsSync(dir)) return out;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/^application.*\.yml$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const PLACEHOLDER_RE = /\$\{([A-Z][A-Z0-9_]*):([^}]*)\}/g;
  for (const f of walk(res)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('#')) continue;
      PLACEHOLDER_RE.lastIndex = 0;
      let m;
      while ((m = PLACEHOLDER_RE.exec(line)) !== null)
        if (!map.has(m[1])) map.set(m[1], m[2]);
    }
  }
  return map;
}

// ── T6: enumerate client files + call sites path-granularity (A2) ─────────────
// pair := { module, className, method, path, dest, evidence(file:line), baseSrc }
function enumeratePairs(backendDir) {
  const all = walkJava(join(backendDir, 'services'))
    .concat(walkJava(join(backendDir, 'gateway')));
  const clientFiles = [];
  const excluded = [];
  for (const f of all.sort()) {
    // CHỈ main-source (src/main/java) — test client (CatalogClientTest) không
    // phải call runtime s2s.
    if (!f.includes(`${sep}src${sep}main${sep}java${sep}`)) continue;
    const text = readFileSync(f, 'utf8');
    if (!CLIENT_DEF_RE.test(text)) continue;
    const base = f.split(sep).at(-1);
    const module = moduleOf(backendDir, f);
    if (EXCLUDED_CLIENTS.has(base)) {
      excluded.push({ file: relative(REPO, f), module, reason: EXCLUDED_CLIENTS.get(base) });
      continue;
    }
    clientFiles.push({ file: f, module, text });
  }

  const ymlCache = new Map();
  const ymlVars = (module) => {
    if (!ymlCache.has(module)) ymlCache.set(module, loadYmlVarDefaults(backendDir, module));
    return ymlCache.get(module);
  };

  // resolve destination compose service từ base-url default
  const resolveDest = (module, className, file) => {
    // 1) @Value("${...base-url:http://localhost:PORT}") ngay trong file
    const m = file.text.match(VALUE_BASEURL_RE);
    if (m) {
      const port = (m[2].match(/:(\d+)/) || [])[1];
      const svc = port ? PORT_TO_SERVICE[Number(port)] : null;
      return svc
        ? { dest: svc, src: `${relative(REPO, file.file)} (@Value ${m[1]}:${m[2]})` }
        : null;
    }
    // 2) props-hint var → application.yml module ${VAR:default}
    // (khóa map dùng TÊN FILE — className ở đây đã strip .java)
    const hintVar = PROPS_BASE_HINTS.get(`${module}/${className}.java`);
    if (hintVar) {
      const def = ymlVars(module).get(hintVar);
      const port = def ? (def.match(/:(\d+)/) || [])[1] : null;
      const svc = port ? PORT_TO_SERVICE[Number(port)] : null;
      return svc
        ? { dest: svc, src: `application.yml ${hintVar}:${def} (props-hint ${module}/${className}.java)` }
        : null;
    }
    return null;
  };

  const pairs = [];
  const unresolved = [];
  for (const cf of clientFiles) {
    const className = cf.file.split(sep).at(-1).replace(/\.java$/, '');
    const dest = resolveDest(cf.module, className, cf);
    if (!dest) {
      unresolved.push({ module: cf.module, className, file: relative(REPO, cf.file),
        reason: 'base-url không resolve được vào compose service (A3) — cần hint' });
      continue;
    }
    // identifier map cho uri-by-variable: @Value("...") String byIdPath
    const idMap = new Map();
    for (const mm of cf.text.matchAll(VALUE_PARAM_RE)) {
      const [prop, def] = mm[1].includes(':') ? [mm[1].slice(0, mm[1].indexOf(':')), mm[1].slice(mm[1].indexOf(':') + 1)]
        : [mm[1], null];
      idMap.set(mm[2], { prop, def });
    }
    const lines = cf.text.split('\n');
    const cur = { method: null, methodLine: null };
    for (let ln = 0; ln < lines.length; ln++) {
      const t = lines[ln].trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      const rm = lines[ln].match(REST_METHOD_RE);
      const hl = lines[ln].match(HELPER_LAMBDA_RE);
      if (rm) { cur.method = rm[1].toUpperCase(); cur.methodLine = ln; }
      else if (hl) { cur.method = hl[1].toUpperCase(); cur.methodLine = ln; }
      const lit = lines[ln].match(URI_LITERAL_RE);
      const vari = lines[ln].match(URI_VARIABLE_RE);
      let rawPath = null;
      if (lit) rawPath = lit[1];
      else if (vari) {
        const id = idMap.get(vari[1]);
        if (id && id.def) rawPath = id.def;
        else {
          unresolved.push({ module: cf.module, className, file: relative(REPO, cf.file),
            reason: `.uri(${vari[1]} + …) không resolve được default (dòng ${ln + 1})` });
          continue;
        }
      }
      if (rawPath == null) continue;
      let path = rawPath.split('?')[0];
      // uri-by-variable nối ID tại call-site (.uri(byIdPath + productId)) —
      // chuẩn hóa pair path sang dạng template để 1:1 với curated matrix.
      if (vari && path.endsWith('/')) path += '{id}';
      pairs.push({
        module: cf.module, className,
        method: cur.method || 'UNRESOLVED',
        path,
        dest: dest.dest,
        evidence: `${relative(REPO, cf.file)}:${ln + 1}`,
        methodEvidence: cur.methodLine != null ? `${relative(REPO, cf.file)}:${cur.methodLine + 1}` : '',
        baseSrc: dest.src,
      });
    }
  }
  // dedup (module, className, method, path) — nhiều call cùng path về 1 pair,
  // evidence gộp
  const byKey = new Map();
  for (const p of pairs) {
    const k = `${p.module}|${p.className}|${p.method}|${p.path}`;
    if (!byKey.has(k)) byKey.set(k, p);
    else byKey.get(k).evidence += ` + ${p.evidence}`;
  }
  const deduped = [...byKey.values()].sort((a, b) =>
    a.module.localeCompare(b.module) || a.className.localeCompare(b.className) ||
    a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return { pairs: deduped, excluded, unresolved, clientFileCount: clientFiles.length };
}

// ── T7: SecurityConfig guard đích (service-side path — s2s gọi thẳng port) ────
// Parse requestMatchers(...) theo THỨ TỰ document (match order Spring) +
// anyRequest. Ant-pattern đơn giản: `**` / `*` / `?` / `{var}`.
function antToRegex(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (pattern.startsWith('**', i)) {
      // Spring: '/foo/**' khớp CẢ '/foo' (0 segment) — ăn luôn '/' trước đó
      if (re.endsWith('/')) { re = re.slice(0, -1); re += '(?:/.*)?'; }
      else re += '.*';
      i++;
    }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '.';
    else if (c === '{') { re += '[^/]+'; i = pattern.indexOf('}', i); if (i === -1) fail(`pattern {var} không đóng: ${pattern}`); }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function parseSecurityGuards(backendDir) {
  const guards = new Map(); // service → [{methods, patterns, guard, line}]
  for (const f of walkJava(join(backendDir, 'services')).concat(walkJava(join(backendDir, 'gateway')))) {
    if (!f.includes(`${sep}src${sep}main${sep}java${sep}`)) continue;
    if (!f.split(sep).at(-1).endsWith('SecurityConfig.java')) continue;
    const svc = moduleOf(backendDir, f);
    const lines = readFileSync(f, 'utf8').split('\n');
    const rules = [];
    let buf = null; // {methods, patterns, startLine, bufText}
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
      } else {
        buf.text += '\n' + line;
      }
      if (buf != null && /\)\s*\.\s*(permitAll|hasRole|hasAuthority|authenticated|denyAll|access)\s*\(/.test(line)) {
        for (const m of buf.text.matchAll(/"([^"]+)"/g)) buf.patterns.push(m[1]);
        const g = line.match(/\.\s*(permitAll|hasRole|hasAuthority|authenticated|denyAll|access)\s*\(\s*([^)]*)\s*\)/);
        rules.push({ methods: buf.methods, patterns: buf.patterns, guard: g[1], guardArg: g[2], line: buf.startLine });
        buf = null;
      }
    }
    if (buf != null) fail(`${relative(REPO, f)}: requestMatchers mở không đóng (thiếu guard) — fail-loud`);
    guards.set(svc, rules);
  }
  return guards;
}

// spring-security starter có trong pom không (special rule plan-critic:
// KHÔNG SecurityConfig + KHÔNG starter → guard = permitAll, không GAP)
function hasSpringSecurity(backendDir, service) {
  const pom = join(backendDir, 'services', service, 'pom.xml');
  if (!existsSync(pom)) return null; // không phải module Spring (invoice Python)
  return /spring-boot-starter-security|spring-security/.test(readFileSync(pom, 'utf8'));
}

const GUARD_VERB_VN = {
  permitAll: 'permitAll', authenticated: 'authenticated (mọi JWT hợp lệ)',
  hasRole: (a) => `hasRole(${a})`, hasAuthority: (a) => `hasAuthority(${a})`,
};

// ── Curated verdict (T7) — data đã đối chiếu tay từ code nguồn, evidence 2 ───
// phía (client call + guard đích + seed nếu liên quan). Token KHÔNG BAO GIỜ
// in giá trị — chỉ nguồn var (masked) + header name.
// token: 'none' | 'empty-config' (gắn header nhưng var UNSET/default rỗng) |
//        'valid-admin' | 'valid-user' | 'internal-token'
const CURATED = new Map([
  // cart → catalog/inventory
  ['cart-service|CatalogEnricher|GET /api/catalog/products/{slug}', { token: 'none', note: 'public PDP — không cần token' }],
  ['cart-service|InventoryChecker|GET /inventory/availability', { token: 'none', note: 'public badge tồn kho' }],
  // catalog → inventory
  ['catalog-service|InventoryAvailabilityClient|GET /inventory/availability', { token: 'none', note: 'public availability (enrich PDP)' }],
  // notification → identity/ordering/catalog
  ['notification-service|IdentityClient|POST /auth/login', { token: 'none', note: 'login service-account (public API)' }],
  ['notification-service|IdentityClient|POST /auth/register', { token: 'none', note: 'register service-account — self-healing 401 (public API)' }],
  ['notification-service|InvoiceClient|GET /admin/orders/{id}/invoice',
    { token: 'valid-admin', note: 'Bearer từ IdentityClient.getAccessToken() — service-account notification-svc được seed ADMIN (scripts/seed/seed.sh:75) — role phụ thuộc seed chạy' }],
  ['notification-service|CatalogStockAlertClient|GET /api/catalog/internal/stock-alerts/candidates',
    { token: 'internal-token', note: 'X-Internal-Token ${CATALOG_INTERNAL_TOKEN:«masked»} — enforced Ở CONTROLLER catalog (guard permitAll chủ đích)' }],
  ['notification-service|CatalogStockAlertClient|POST /api/catalog/internal/stock-alerts/claim',
    { token: 'internal-token', note: 'như candidates — X-Internal-Token controller-side' }],
  // ordering → catalog/inventory/affiliate/payment/invoice
  ['ordering-service|HttpCatalogPricingClient|GET /api/catalog/admin/products/{id}',
    { token: 'empty-config', note: 'Bearer ${CATALOG_API_TOKEN:} — compose UNSET + default rỗng → header "Bearer " → catalog 401 → ordering 502 (bug 9/9 re-price, hiện trạng CHƯA fix)' }],
  ['ordering-service|InventoryClient|POST /inventory/reservations',
    { token: 'none', note: 'permitAll CÓ CHỦ ĐÍCH (inventory SecurityConfig ghi rõ saga không header; internal-token là follow-up P2)' }],
  ['ordering-service|LoyaltyClient|POST /api/affiliate/internal/loyalty/redeem',
    { token: 'internal-token', note: 'X-Internal-Token ${ordering.loyalty.internal-token:«masked»} — controller affiliate enforce; reachability mắc CFG-A-06 (AFFILIATE_BASE_URL localhost) là finding trục (a) riêng' }],
  ['ordering-service|PaymentClient|POST /payment/intents', { token: 'none', note: 'payment không Spring Security — Idempotency-Key không phải auth' }],
  ['ordering-service|PaymentClient|POST /payment/refunds', { token: 'none', note: 'như intents' }],
  ['ordering-service|PaymentClient|POST /payment/cod/captures', { token: 'none', note: 'như intents' }],
  ['ordering-service|HttpInvoiceProvider|POST /api/invoice/generate', { token: 'none', note: 'invoice-service Python (ngoài backend/) — không Spring Security; mạng nội bộ compose' }],
  // partner → catalog/identity/ordering
  ['partner-api|CatalogClient|GET /api/catalog/products', { token: 'valid-admin', note: 'Bearer ${CATALOG_API_TOKEN:} gắn sẵn (defaultHeader) dù path public — vô hại' }],
  ['partner-api|CatalogClient|GET /api/catalog/search', { token: 'valid-admin', note: 'như list' }],
  ['partner-api|CatalogClient|GET /api/catalog/categories', { token: 'valid-admin', note: 'như list' }],
  ['partner-api|CatalogClient|GET /api/catalog/products/{slug}', { token: 'valid-admin', note: 'như list' }],
  ['partner-api|CatalogClient|GET /api/catalog/admin/products/{id}',
    { token: 'empty-config', note: 'Bearer ${CATALOG_API_TOKEN:} — partner compose UNSET; client có guard adminTokenConfigured() 502 TRƯỚC khi gọi (GAP-3 interim, fail-loud ops-visible) — hiện trạng: gọi không thể xảy ra không token nhưng chức năng chết' }],
  ['partner-api|IdentityClient|POST /auth/login', { token: 'none', note: 'login service-account (public API)' }],
  ['partner-api|IdentityClient|POST /auth/register', { token: 'none', note: 'register service-account (public API)' }],
  ['partner-api|OrderingClient|POST /orders', { token: 'valid-user', note: 'Bearer service-account partner-svc (đủ authenticated — tạo đơn thay partner, GAP-1 interim)' }],
  ['partner-api|OrderingClient|GET /me/orders/{id}', { token: 'valid-user', note: 'Bearer service-account — path /me/** scoped theo account gọi' }],
]);

const TOKEN_DISPLAY = {
  'none': 'không gắn (không cần)',
  'empty-config': 'gắn Bearer NHƯNG var UNSET → token rỗng',
  'valid-admin': 'Bearer (service-account ADMIN theo seed)',
  'valid-user': 'Bearer (service-account)',
  'internal-token': 'X-Internal-Token (controller-side check)',
};

// Verdict A5: EXPECTED_OK (permitAll hoặc token đủ role) / DANGEROUS (cần
// auth mà token không có hiệu lực) / GAP (không resolve tĩnh).
function verdictFor(pair, guards, backendDir) {
  const rules = guards.get(pair.dest);
  let guard, guardEvidence, guardNote = '';
  if (!rules || rules.length === 0) {
    const ss = hasSpringSecurity(backendDir, pair.dest);
    if (ss === false) {
      guard = 'permitAll*';
      guardEvidence = `${pair.dest}/pom.xml (không spring-security) · không SecurityConfig`;
      guardNote = 'không SecurityConfig + không spring-boot-starter-security — gateway front door enforce (special rule, không GAP)';
    } else if (ss === null) {
      guard = 'permitAll*';
      guardEvidence = 'service ngoài backend/ (Python) — không Spring Security';
      guardNote = 'non-JVM service — không Spring Security; network-internal compose';
    } else {
      return { verdict: 'GAP', reason: `SecurityConfig khai báo spring-security nhưng không parse được rules — ${pair.dest}` };
    }
  } else {
    const rule = rules.find((r) =>
      (r.methods == null || r.methods.includes(pair.method)) &&
      r.patterns.some((p) => antToRegex(p).test(pair.path)));
    if (!rule) return { verdict: 'GAP', reason: `không rule nào match ${pair.method} ${pair.path} ở ${pair.dest} (anyRequest cũng không có?)` };
    guard = rule.guard === 'hasRole' || rule.guard === 'hasAuthority'
      ? `${rule.guard}(${rule.guardArg})` : rule.guard;
    guardEvidence = `SecurityConfig ${pair.dest}:${rule.line} — ${rule.patterns.join(', ')}${rule.methods ? ' [' + rule.methods.join(',') + ']' : ''}`;
  }

  const key = `${pair.module}|${pair.className}|${pair.method} ${pair.path}`;
  const cur = CURATED.get(key);
  if (!cur) return { verdict: 'GAP', reason: `pair ${key} chưa có curated verdict (matrix stale — cần triage)`, guard, guardEvidence, guardNote };

  let verdict;
  if (guard === 'permitAll' || guard === 'permitAll*') verdict = 'EXPECTED_OK';
  else if (cur.token === 'none') verdict = 'DANGEROUS';
  else if (guard.includes('ADMIN') || guard.includes('admin')) verdict = cur.token === 'valid-admin' ? 'EXPECTED_OK' : 'DANGEROUS';
  else if (guard.startsWith('authenticated') || guard.startsWith('hasRole') || guard.startsWith('hasAuthority')) verdict = (cur.token === 'valid-admin' || cur.token === 'valid-user') ? 'EXPECTED_OK' : 'DANGEROUS';
  else verdict = 'GAP'; // denyAll/access… — không taxonomy
  return { verdict, guard, guardEvidence, guardNote, tokenNote: cur.note, tokenDisplay: TOKEN_DISPLAY[cur.token] };
}

// ── Report writer — marker-based, idempotent (chỉ block sf1:s2s) ──────────────
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

// ── main (T7) ────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { pairs, excluded, unresolved, clientFileCount } = enumeratePairs(opts.backend);
  const guards = parseSecurityGuards(opts.backend);

  console.log(`== s2s-auth-matrix: enumerate (A2) + verdict (A5) ==`);
  console.log(`   client files in-scope: ${clientFileCount} · excluded A3: ${excluded.length} · SecurityConfig parse: ${guards.size} services · pair: ${pairs.length}\n`);

  // verdict từng pair + drift check enumerate ↔ curated 1:1
  const rows = [];
  const findings = [];
  for (const p of pairs) {
    const v = verdictFor(p, guards, opts.backend);
    rows.push({ ...p, ...v });
    if (v.verdict === 'DANGEROUS' || v.verdict === 'GAP')
      findings.push({ ...p, ...v });
    const curKey = `${p.module}|${p.className}|${p.method} ${p.path}`;
    CURATED.delete(curKey); // đếm curated còn thừa (row không có live call-site)
  }
  for (const staleKey of CURATED.keys())
    findings.push({ verdict: 'GAP', staleKey, reason: 'curated row KHÔNG có live call-site (stale matrix — call đã bị xóa/sửa)', module: staleKey.split('|')[0], className: staleKey.split('|')[1] });

  // ID deterministic A11: sort (module, className, path) — DANGEROUS + GAP chung dãy
  findings.sort((a, b) =>
    (a.module || '').localeCompare(b.module || '') ||
    (a.className || '').localeCompare(b.className || '') ||
    (a.path || a.staleKey || '').localeCompare(b.path || b.staleKey || ''));
  findings.forEach((f, i) => { f.id = `S2S-${String(i + 1).padStart(2, '0')}`; });

  const cnt = { EXPECTED_OK: 0, DANGEROUS: 0, GAP: 0 };
  for (const r of rows) cnt[r.verdict] = (cnt[r.verdict] || 0) + 1;

  for (const r of rows) {
    console.log(`   [${r.verdict}] ${r.module}/${r.className} — ${r.method} ${r.path} → ${r.dest}`);
    console.log(`      guard: ${r.guard} · token: ${r.tokenDisplay || '—'}\n      ↳ ${r.guardEvidence}\n      client: ${r.evidence}${r.tokenNote ? ' · ' + r.tokenNote : ''}`);
  }
  for (const u of unresolved)
    console.log(`   [GAP] UNRESOLVED ${u.module}/${u.className} — ${u.reason}`);
  console.log(`\n   verdicts: EXPECTED_OK=${cnt.EXPECTED_OK} · DANGEROUS=${cnt.DANGEROUS} · GAP=${cnt.GAP + unresolved.length} · findings: ${findings.map((f) => f.id).join(', ') || '—'}`);

  // unresolved base-url → GAP findings (thêm sau khi sort — ID tie vào findings chính)
  for (const u of unresolved) {
    const id = `S2S-${String(findings.length + 1 + unresolved.indexOf(u)).padStart(2, '0')}`;
    findings.push({ ...u, verdict: 'GAP', id });
  }

  // drift check kết luận
  const staleCount = findings.filter((f) => f.staleKey).length;
  const driftNote = staleCount === 0 && unresolved.length === 0
    ? `Drift check: enumerate ${pairs.length} call-site ↔ curated ${pairs.length} rows — 1:1 (0 stale, 0 missing).`
    : `Drift check LỆCH: ${staleCount} stale curated row · ${unresolved.length} unresolved — xem findings.`;

  // exit semantics
  const exitCode = findings.length > 0 ? 1 : 0;

  // ── report marker sf1:s2s ──
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const matrixRows = rows.map((r) => [
    r.module.split('-')[0] + '.' + r.className, `${r.method} ${r.path}`, r.dest,
    r.guard + (r.guardNote ? '*' : ''), r.tokenDisplay || '—', r.verdict,
    trunc(`${r.evidence}`, 52) + ' ⟂ ' + trunc(r.guardEvidence, 52),
  ]);
  const findingsRows = findings.map((f) => [
    f.id, f.verdict,
    f.staleKey ? f.staleKey : `${f.module}/${f.className} — ${f.method} ${f.path}`,
    trunc(f.reason || f.tokenNote || '—', 130),
    trunc(f.evidence || f.file || '—', 80),
  ]);
  const content = [
    `### s2s auth matrix — STATIC (A2 · A3 · A5)`,
    '',
    `Run ${now} — enumerate tĩnh ${pairs.length} pair path-granularity (pair := client class × endpoint path; ngưỡng A2 ≥ 23: **${pairs.length >= 23 ? 'ĐẠT' : 'THẤU — flag epic'}**) · ${clientFileCount} client file main-source in-scope · ${excluded.length} file loại trừ A3 · ${guards.size} SecurityConfig parse.`,
    '',
    `Guard đích = SecurityConfig service ĐÍCH, service-side path (s2s gọi thẳng port service, KHÔNG qua gateway StripPrefix). \`permitAll*\` = service không SecurityConfig + không spring-security (payment · invoice-Python) — special rule plan-critic: ghi note, KHÔNG GAP. Verdicts: **EXPECTED_OK=${cnt.EXPECTED_OK} · DANGEROUS=${cnt.DANGEROUS} · GAP=${cnt.GAP + unresolved.length}** → exit **${exitCode}**.`,
    '',
    `**Findings (S2S-xx — A11 deterministic):**`,
    '',
    mdTable(['ID', 'verdict', 'pair', 'lý do / ghi chú', 'evidence'],
      findingsRows.length ? findingsRows : [['—', '—', '—', '0 finding', '—']]),
    '',
    `**Matrix đầy đủ (${pairs.length} pair):**`,
    '',
    mdTable(['client (module)', 'call', 'destination', 'guard đích', 'token attach', 'verdict', 'evidence (client ⟂ guard)'], matrixRows),
    '',
    `**Loại trừ A3 (${excluded.length} client file):** ${excluded.map((e) => `\`${e.file.split('/').slice(-2).join('/')}\` (${e.reason.split(' — ')[0]})`).join(' · ')}.`,
    '',
    driftNote,
    '',
    `> Phương pháp: enumerate client = file main-source build/dùng RestClient|WebClient|RestTemplate (file chỉ catch RestClientException KHÔNG phải client). Base-url resolve qua @Value / props-hint constant → port → compose service (A3). Token attach chỉ in TÊN var nguồn («masked» theo policy) + header name — KHÔNG giá trị. Static ≠ runtime: matrix là EXPECTED — live execute là harness SF-2 + triage SF-4.`,
  ].join('\n');
  upsertSection(opts.report, 's2s', content);

  console.log(`\n== s2s-auth-matrix EXIT=${exitCode} — findings: ${findings.map((f) => f.id).join(', ') || '0'} ==`);
  console.log(`   report: ${relative(REPO, opts.report)} — regen marker sf1:s2s (block khác giữ nguyên)`);
  return exitCode;
}

try { process.exit(main()); } catch (e) {
  console.error(`s2s-auth-matrix: LỖI script (exit 2): ${e && e.stack ? e.stack : e}`);
  process.exit(2);
}
