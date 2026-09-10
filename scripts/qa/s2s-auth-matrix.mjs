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
      const path = rawPath.split('?')[0];
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

// ── main (T6: enumerate + in; T7 sẽ ghép verdict matrix + report + exit) ─────
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { pairs, excluded, unresolved, clientFileCount } = enumeratePairs(opts.backend);

  console.log(`== s2s-auth-matrix: enumerate path-granularity (A2) ==`);
  console.log(`   client files in-scope: ${clientFileCount} · excluded A3: ${excluded.length} · pair: ${pairs.length} · unresolved: ${unresolved.length}\n`);

  console.log(`— Loại trừ A3 (${excluded.length}):`);
  for (const e of excluded) console.log(`   ${e.file} — ${e.reason}`);
  console.log('');
  let curModule = null;
  for (const p of pairs) {
    if (p.module !== curModule) { curModule = p.module; console.log(`— ${curModule}`); }
    console.log(`   ${p.className.padEnd(28)} ${p.method.padEnd(7)} ${p.path}`);
    console.log(`     ↳ dest=${p.dest} · ${p.evidence}${p.methodEvidence ? ' (method: ' + p.methodEvidence + ')' : ''}`);
    console.log(`       base: ${p.baseSrc}`);
  }
  if (unresolved.length) {
    console.log(`\n— UNRESOLVED base/uri (${unresolved.length}) — sẽ thành GAP ở T7:`);
    for (const u of unresolved) console.log(`   ${u.module}/${u.className} — ${u.reason} · ${u.file}`);
  }
  console.log(`\n== T6 enumerate OK: ${pairs.length} pair (ngưỡng A2 ≥ 23: ${pairs.length >= 23 ? 'ĐẠT' : 'THẤU — report THẬT, flag epic, KHÔNG pad'}) ==`);
  return 0;
}

try { process.exit(main()); } catch (e) {
  console.error(`s2s-auth-matrix: LỖI script (exit 2): ${e && e.stack ? e.stack : e}`);
  process.exit(2);
}
