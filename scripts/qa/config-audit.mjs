#!/usr/bin/env node
/**
 * config-audit.mjs — SF-1 qa-static-audit (FI-405) — executor A (T1–T5, T9).
 *
 * Detector TĨNH 3 trục so code-read ↔ docker-compose cung cấp (KHÔNG docker,
 * KHÔNG HTTP, KHÔNG đọc .env — chỉ đọc file):
 *   (a) env var  : `${VAR:default}` từ application*.yml + gateway-routes.yml +
 *                  routes/*.yml (A4) + @Value("${...}") ↔ `environment:` compose.
 *   (b) volume   : env path service đọc lúc boot ↔ container-target volume của
 *                  chính service đó (A6) — thiếu mount / path lệch = DANGEROUS.
 *   (c) compose  : closed checklist (A7) — max_connections ≥ 110, healthcheck
 *                  per JVM service, flag ngoài bảng constant → WARN non-finding.
 *
 * Exit semantics: 0 = 0 finding CHƯA fix · 1 = ≥1 finding · 2 = script error
 * (parser fail-loud A9 — shape lạ → stderr + exit 2, KHÔNG đoán mò).
 *
 * node >= 18 stdlib ONLY — không yaml lib (line-level parse, precedent
 * scripts/qa/vi-hardcode-scan.mjs). Secret masking bắt buộc: var match
 * /PASS|SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE/i → in «masked» (ngoại lệ:
 * giá trị path-shape vd /keys/jwt-public.pem in được).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..', '..');

// ── Hằng số chia sẻ ──────────────────────────────────────────────────────────
const SECRET_RE = /PASS|SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE/i;
// File-path THẬT (có extension) — loại trừ HTTP path như /api/catalog/.../by-id/
// (trailing slash / không extension) và URL. Dùng để tách data trục (a) vs (b).
const FS_PATH_RE = /^(\/|\.\.?\/).+\.[A-Za-z0-9]{2,5}$/;
const LOCALHOST_RE = /localhost|127\.0\.0\.1/;
const FE_PORT_RE = /:(3000|5173)(\D|$)/;       // FE-host whitelist: dev port FE
const FE_VAR_RE = /VITE_|STOREFRONT|SHELL/;    // FE-host whitelist: tên var
const ENV_VAR_RE = /^[A-Z][A-Z0-9_]*$/;        // shape env-var UPPER_SNAKE

function fail(msg) {
  // Fail-loud A9 — shape không parse được → exit 2, KHÔNG đoán.
  console.error(`config-audit: FAIL-LOUD: ${msg}`);
  process.exit(2);
}
function maskValue(varName, value) {
  if (value == null) return '(không default)';
  if (value === '') return '(rỗng)';
  if (SECRET_RE.test(varName) && !FS_PATH_RE.test(value)) return '«masked»';
  return value;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    compose: join(REPO, 'docker-compose.yml'),
    backend: join(REPO, 'backend'),
    routes: join(REPO, 'backend', 'gateway', 'src', 'main', 'resources', 'routes'),
    report: join(REPO, 'docs', 'superpowers', 'qa', 'report-sf1.md'),
    fixed: join(SCRIPT_DIR, 'config-audit-fixed.json'),
    selfTest: false,
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
    if ((v = take('--compose'))) opts.compose = resolve(v);
    else if ((v = take('--backend'))) opts.backend = resolve(v);
    else if ((v = take('--routes'))) opts.routes = resolve(v);
    else if ((v = take('--report'))) opts.report = resolve(v);
    else if (a === '--self-test') opts.selfTest = true;
    else fail(`flag không nhận dạng: '${a}' (hỗ trợ: --compose --backend --routes --report --self-test)`);
  }
  return opts;
}

// ── Parser docker-compose (line-level, fail-loud) ────────────────────────────
// Chỉ consume: services → environment / volumes / build.dockerfile / command /
// healthcheck. Key khác (ports, depends_on, networks...) NHẬN DIỆN rồi skip
// block an toàn — key KHÔNG nhận diện được → fail-loud (A9, không đoán).
const SERVICE_KEYS = new Set([
  'image', 'container_name', 'command', 'entrypoint', 'environment', 'ports',
  'volumes', 'build', 'profiles', 'depends_on', 'networks', 'expose',
  'healthcheck', 'restart', 'extra_hosts', 'hostname', 'user', 'labels',
  'deploy', 'tty', 'stdin_open', 'env_file', 'working_dir',
]);

// Strip inline `# comment` trong value — CHỈ # có khoảng trắng phía trước và
// ngoài quote (giữ nguyên `NotifySvc#2026` — # dính chữ không phải comment).
function cleanValue(v) {
  let out = '';
  let q = null;
  for (let c = 0; c < v.length; c++) {
    const ch = v[c];
    if (q) { out += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
    if (ch === '#' && (c === 0 || /\s/.test(v[c - 1]))) break;
    out += ch;
  }
  out = out.trim();
  if (out.length >= 2 && ((out[0] === '"' && out.at(-1) === '"') || (out[0] === "'" && out.at(-1) === "'")))
    out = out.slice(1, -1);
  return out;
}

// Value compose có thể là tham chiếu host-env: `${X:-}`, `${X:-default}` —
// "set rỗng" (tail='') là trạng thái RIÊNG với UNSET (plan edge-case).
function composeValueShape(v) {
  const m = typeof v === 'string' ? v.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*):-?(.*)\}$/) : null;
  if (!m) return { kind: 'literal', value: v };
  return { kind: 'hostref', hostVar: m[1], tail: m[2] };
}
// Giá trị hiệu lực khai báo trong compose (host-env có thể override .env —
// KHÔNG đọc .env nên dùng tail khai báo để so sánh, ghi chú rõ trong report).
function resolveComposeValue(v) {
  const s = composeValueShape(v);
  return s.kind === 'hostref' ? s.tail : s.value;
}

function parseCompose(file) {
  if (!existsSync(file)) fail(`Không tìm thấy compose: ${file}`);
  const lines = readFileSync(file, 'utf8').split('\n');
  const services = new Map(); // name → {name, env:Map, volumes[], healthcheck, command, dockerfile}
  const rel = (i) => `${relative(REPO, file)}:${i + 1}`;
  let ctx = { mode: 'root' };
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) { i++; continue; }
    const indent = lines[i].length - lines[i].trimStart().length;
    if (indent % 2 !== 0) fail(`${rel(i)}: indent lẻ (${indent}) — shape YAML không xử lý được`);

    if (ctx.mode === 'root' || ctx.mode === 'other-root') {
      if (indent > 0) {
        if (ctx.mode === 'other-root') { i++; continue; } // block root lạ — skip
        fail(`${rel(i)}: dòng thụt lề ngoài block root biết trước`);
      }
      const m = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (!m) fail(`${rel(i)}: dòng root không khớp 'key:' — '${trimmed}'`);
      if (m[1] === 'services' && m[2] === '') ctx = { mode: 'services' };
      else if (m[2] === '') ctx = { mode: 'other-root' }; // volumes:/networks: block — skip
      i++;
      continue;
    }
    // Mức services: indent 2 = tên service
    if (ctx.mode === 'services') {
      if (indent === 0) { ctx = { mode: 'root' }; continue; } // hết services — rewind
      if (indent !== 2) fail(`${rel(i)}: trong 'services:' mong đợi indent 2, thấy ${indent}`);
      const m = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (!m || m[2] !== '') fail(`${rel(i)}: service phải dạng 'ten-service:' — '${trimmed}'`);
      services.set(m[1], { name: m[1], env: new Map(), volumes: [], healthcheck: false, command: null, dockerfile: null });
      ctx = { mode: 'service', svc: m[1] };
      i++;
      continue;
    }
    // Rewind cho sub-mode (env/volumes/build/skip) gặp dòng mức service/services/root.
    // LƯU Ý: mode 'service' xử lý indent 4 làm đường chính — KHÔNG rewind chính nó.
    const rewind = indent === 4 ? { mode: 'service', svc: ctx.svc }
      : indent === 2 ? { mode: 'services' } : indent === 0 ? { mode: 'root' } : null;
    if (ctx.mode === 'service') {
      if (indent === 0) { ctx = { mode: 'root' }; continue; }
      if (indent === 2) { ctx = { mode: 'services' }; continue; }
      if (indent !== 4) fail(`${rel(i)}: key service mong đợi indent 4, thấy ${indent}`);
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.-]*):\s*(.*)$/);
      if (!m) fail(`${rel(i)}: key service không khớp 'key:' — '${trimmed}'`);
      const [, k, v] = m;
      if (!SERVICE_KEYS.has(k)) fail(`${rel(i)}: key service lạ '${k}' — fail-loud A9 (mở rộng SERVICE_KEYS nếu hợp lệ)`);
      const svc = services.get(ctx.svc);
      if (k === 'environment') {
        if (v !== '') fail(`${rel(i)}: 'environment:' inline không hỗ trợ — cần block-style`);
        ctx = { mode: 'env', svc: ctx.svc };
      } else if (k === 'volumes') {
        if (v !== '') fail(`${rel(i)}: 'volumes:' inline không hỗ trợ — cần block-style`);
        ctx = { mode: 'volumes', svc: ctx.svc };
      } else if (k === 'build') {
        ctx = v === '' ? { mode: 'build', svc: ctx.svc } : { mode: 'skip-service', svc: ctx.svc };
      } else if (k === 'image') {
        svc.image = v; // trục (c) cần nhận diện postgres qua image
      } else if (k === 'command') {
        if (v === '') fail(`${rel(i)}: 'command:' block-scalar không hỗ trợ — fail-loud`);
        svc.command = v;
      } else if (k === 'healthcheck') {
        svc.healthcheck = true;
        ctx = { mode: 'skip-service', svc: ctx.svc };
      } else {
        ctx = { mode: 'skip-service', svc: ctx.svc }; // image/ports/depends_on/... block — skip an toàn
      }
      i++;
      continue;
    }
    if (ctx.mode === 'env') {
      if (rewind) { ctx = rewind; continue; }
      if (indent !== 6) fail(`${rel(i)}: entry 'environment:' mong đợi indent 6, thấy ${indent}`);
      let m = trimmed.match(/^-\s+([A-Za-z_][A-Za-z0-9_.]*)=(.*)$/); // list-style - KEY=VAL
      if (m) { services.get(ctx.svc).env.set(m[1], cleanValue(m[2])); i++; continue; }
      m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.]*):\s*(.*)$/); // map-style KEY: value
      if (!m) fail(`${rel(i)}: entry environment không khớp 'KEY: value' / '- KEY=VAL' — '${trimmed}'`);
      services.get(ctx.svc).env.set(m[1], cleanValue(m[2]));
      i++;
      continue;
    }
    if (ctx.mode === 'volumes') {
      if (rewind) { ctx = rewind; continue; }
      if (indent !== 6) fail(`${rel(i)}: entry 'volumes:' mong đợi indent 6, thấy ${indent}`);
      const m = trimmed.match(/^-\s*(.+)$/);
      if (!m) fail(`${rel(i)}: entry volumes phải '- src:dst[:mode]' — '${trimmed}'`);
      const parts = m[1].split(':');
      if (parts.length < 2) fail(`${rel(i)}: volume thiếu container-target — '${m[1]}'`);
      services.get(ctx.svc).volumes.push({ host: parts[0], container: parts[1], mode: parts[2] || '' });
      i++;
      continue;
    }
    if (ctx.mode === 'build') {
      if (rewind) { ctx = rewind; continue; }
      const m = trimmed.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (m && m[1] === 'dockerfile') services.get(ctx.svc).dockerfile = m[2];
      i++; // context: ... bỏ qua
      continue;
    }
    if (ctx.mode === 'skip-service') {
      if (rewind) { ctx = rewind; continue; }
      i++; // sub-block của key không consume (depends_on/ports/test healthcheck...)
      continue;
    }
    fail(`${rel(i)}: parser rơi vào trạng thái lạ '${ctx.mode}' — fail-loud`);
  }
  if (services.size === 0) fail(`${relative(REPO, file)}: không tìm thấy block 'services:'`);
  return services;
}

// ── Extract placeholder từ code ──────────────────────────────────────────────
function walkFiles(dir, test, out = []) {
  if (!existsSync(dir)) return out; // fixture cây tối giản có thể thiếu dir
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); }
  catch (e) { fail(`Không đọc được dir '${dir}': ${e.message}`); }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'target') walkFiles(p, test, out); }
    else if (test(p, e.name)) out.push(p);
  }
  return out;
}

// Toàn bộ yml nguồn trục (a): services/*/resources/application*.yml +
// gateway resources (application*.yml + gateway-routes.yml + routes/*.yml — A4).
function collectYmlSources(backendDir) {
  const out = [];
  const svcRoot = join(backendDir, 'services');
  if (existsSync(svcRoot)) {
    for (const e of readdirSync(svcRoot, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const res = join(svcRoot, e.name, 'src', 'main', 'resources');
      for (const f of walkFiles(res, (_p, n) => /^application.*\.yml$/.test(n)))
        out.push({ service: e.name, file: f });
    }
  }
  const gwRes = join(backendDir, 'gateway', 'src', 'main', 'resources');
  const routesDir = join(gwRes, 'routes');
  for (const f of walkFiles(gwRes, (p, n) =>
    /^application.*\.yml$/.test(n) || n === 'gateway-routes.yml' ||
    (p.startsWith(routesDir + sep) && n.endsWith('.yml'))))
    out.push({ service: 'gateway', file: f });
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

function collectJavaSources(backendDir) {
  const out = [];
  for (const root of [join(backendDir, 'services'), join(backendDir, 'gateway')])
    for (const f of walkFiles(root, (_p, n) => n.endsWith('.java'))) out.push(f);
  return out.sort((a, b) => a.localeCompare(b));
}

// service từ path: backend/services/<dir> → <dir>; backend/gateway → gateway
function serviceOfPath(backendDir, file) {
  const rel = relative(backendDir, file);
  const parts = rel.split(sep);
  if (parts[0] === 'services') return parts[1] || fail(`Path lạ (thiếu service dir): ${file}`);
  if (parts[0] === 'gateway') return 'gateway';
  return null; // ngoài services/ + gateway/ — bỏ (vd backend/pom.xml)
}

const PLACEHOLDER_RE = /\$\{([A-Za-z_][A-Za-z0-9_.]*)(?::([^}]*))?\}/g;
const VALUE_ANNOT_RE = /@Value\(\s*"\$\{([^}"]+)\}"\s*\)/g;

// Model gộp theo (service, var): {service, var, default, kind, sources[file:line]}
// default = giá trị non-null ĐẦU TIÊN (yml trước java — walk có sort).
function extractPlaceholders(ymlSources, javaSources, backendDir) {
  const map = new Map(); // 'service|var' → entry
  const add = (service, varName, def, source) => {
    if (!service || !varName) return;
    const key = `${service}|${varName}`;
    if (!map.has(key)) map.set(key, { service, var: varName, default: null, sources: [] });
    const e = map.get(key);
    if (def != null && e.default == null) e.default = def;
    e.sources.push(source);
  };
  // 1) yml — skip dòng comment nguyên dòng (template-service có placeholder trong comment)
  for (const { service, file } of ymlSources) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let ln = 0; ln < lines.length; ln++) {
      const t = lines[ln].trim();
      if (t === '' || t.startsWith('#')) continue;
      PLACEHOLDER_RE.lastIndex = 0;
      let m;
      while ((m = PLACEHOLDER_RE.exec(lines[ln])) !== null) {
        add(service, m[1], m[2] != null ? m[2] : null, `${relative(REPO, file)}:${ln + 1}`);
      }
    }
  }
  // 2) @Value trong Java — skip dòng comment (// * /*)
  for (const file of javaSources) {
    const service = serviceOfPath(backendDir, file);
    if (!service) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let ln = 0; ln < lines.length; ln++) {
      const t = lines[ln].trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      VALUE_ANNOT_RE.lastIndex = 0;
      let m;
      while ((m = VALUE_ANNOT_RE.exec(lines[ln])) !== null) {
        const body = m[1];
        const ci = body.indexOf(':');
        const varName = ci === -1 ? body : body.slice(0, ci);
        const def = ci === -1 ? null : body.slice(ci + 1);
        add(service, varName, def, `${relative(REPO, file)}:${ln + 1}`);
      }
    }
  }
  for (const e of map.values()) {
    e.kind = ENV_VAR_RE.test(e.var) ? 'env' : 'prop-ref'; // prop-ref = property Spring (lowercase) — KHÔNG classify
    e.sources.sort();
  }
  return [...map.values()].sort((a, b) =>
    a.service.localeCompare(b.service) || a.var.localeCompare(b.var));
}

// ── Trục (b) — volume mounts drift (A6) ──────────────────────────────────────
// Mỗi env path service đọc lúc boot (code default + compose env) phải nằm dưới
// (prefix-match) 1 volume container-target của CHÍNH service đó:
//   · code cần path + không env + không volume            → DANGEROUS
//   · path (env/default) không thuộc volume target nào    → DANGEROUS (path lệch)
//   · host-relative default (../infra/keys/x.pem)         → chuẩn hóa basename,
//     file phải tồn tại trong host-source của 1 volume (repo-resolvable).
// HTTP path (ORDERING_PRICING_BYIDPATH=/api/...) KHÔNG phải file-path — bộ lọc
// FS_PATH_RE (có extension) loại sẵn.
function normalizeHostSrc(host) {
  // ./infra/keys → repo-resolvable; named volume (pgdata) → null (không resolve được tĩnh)
  if (!/^[./]/.test(host)) return null;
  return resolve(REPO, host);
}
function prefixMatchTarget(pathValue, targets) {
  return targets.some((t) => pathValue === t || pathValue.startsWith(t + '/'));
}

function analyzeAxisB(compose, placeholders) {
  const rows = [];
  // path-shaped mặc định từ code (env-shaped placeholder + default là file-path)
  const codeByService = new Map();
  for (const p of placeholders) {
    if (p.kind !== 'env' || p.default == null || !FS_PATH_RE.test(p.default)) continue;
    if (!codeByService.has(p.service)) codeByService.set(p.service, []);
    codeByService.get(p.service).push(p);
  }
  // path-shaped env từ compose (kể cả service không có code req — vd invoice font)
  for (const svc of compose.values()) {
    const codeReqs = codeByService.get(svc.name) || [];
    const seen = new Set();
    const targets = svc.volumes.map((v) => v.container);
    const hostSrcs = svc.volumes.map((v) => normalizeHostSrc(v.host)).filter(Boolean);

    const verdictFor = (varName, envVal, codeDefault, codeSrc) => {
      const effective = envVal != null ? envVal : codeDefault;
      const evidence = [
        codeSrc,
        envVal != null ? `compose env ${varName} (set)` : 'compose không set env',
        svc.volumes.length ? `volumes: ${svc.volumes.map((v) => v.host + '→' + v.container).join(', ')}` : 'không có volumes',
      ].filter(Boolean).join(' · ');
      if (envVal == null && svc.volumes.length === 0)
        return { status: 'DANGEROUS', note: 'code cần path, compose không set env + không mount volume', evidence };
      if (FS_PATH_RE.test(effective)) {
        // absolute file-path → phải nằm dưới 1 container-target
        return prefixMatchTarget(effective, targets)
          ? { status: 'OK', note: `${effective} thuộc target ${targets.join('|')}`, evidence }
          : { status: 'DANGEROUS', note: `path ${effective} không thuộc volume target nào (${targets.join('|') || 'không có'})`, evidence };
      }
      // host-relative (../infra/keys/x.pem) → basename phải có trong host-source
      const b = basename(effective);
      const found = hostSrcs.some((src) => existsSync(join(src, b)));
      return found
        ? { status: 'OK', note: `host-relative default — basename ${b} có trong mount host-source`, evidence }
        : { status: 'DANGEROUS', note: `host-relative default ${effective} — không thấy ${b} trong host-source volume`, evidence };
    };

    for (const p of codeReqs) {
      seen.add(p.var);
      const envVal = svc.env.has(p.var) ? resolveComposeValue(svc.env.get(p.var)) : null;
      const v = verdictFor(p.var, envVal, p.default, p.sources.join(', '));
      rows.push({ service: svc.name, var: p.var, default: p.default, envVal, targets, ...v });
    }
    for (const [k, raw] of svc.env) {
      if (seen.has(k)) continue;
      const val = resolveComposeValue(raw);
      if (!FS_PATH_RE.test(val)) continue;
      const v = verdictFor(k, val, null, null);
      rows.push({ service: svc.name, var: k, default: null, envVal: val, targets, ...v });
    }
  }
  return rows.sort((a, b) => a.service.localeCompare(b.service) || a.var.localeCompare(b.var));
}

// ── Trục (c) — compose value drift, closed checklist (A7) ────────────────────
// KHÔNG judgment runtime — chỉ 3 mục đóng:
//   (1) postgres command: max_connections ≥ 110 (11 JVM pools × 10 Hikari)
//   (2) mỗi JVM service có compose entry phải có healthcheck:
//   (3) flag command ngoài bảng KNOWN_FLAGS → WARN (non-finding)
// JVM service = build dockerfile nằm dưới backend/ (invoice là Python — loại).
const KNOWN_FLAGS = {
  max_connections: '11 JVM pools × 10 Hikari default — < 110 thì seed fail 53300 (9/9)',
};
const MIN_MAX_CONNECTIONS = 110;

// Tách token command tôn trọng quote: `server /data --console-address ":9001"`
function commandTokens(cmd) {
  return cmd.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function analyzeAxisC(compose) {
  const rows = [];
  // (1) postgres max_connections
  const pg = [...compose.values()].find((s) => s.name === 'postgres' || (s.image || '').startsWith('postgres:'));
  if (pg) {
    if (pg.command == null) {
      rows.push({ service: 'postgres', check: 'max_connections', status: 'DANGEROUS', note: `postgres không có command: max_connections — default 100 < ${MIN_MAX_CONNECTIONS}`, evidence: 'compose service postgres · command:' });
    } else {
      const toks = commandTokens(pg.command);
      let found = null;
      for (let t = 0; t < toks.length; t++) {
        const m = toks[t].match(/^(?:--)?max_connections=(\d+)$/);
        if (m) { found = Number(m[1]); break; }
        if (toks[t] === '-c' && toks[t + 1]) {
          const m2 = toks[t + 1].match(/^max_connections=(\d+)$/);
          if (m2) { found = Number(m2[1]); break; }
        }
      }
      if (found == null)
        rows.push({ service: 'postgres', check: 'max_connections', status: 'DANGEROUS', note: `command không chứa max_connections — default 100 < ${MIN_MAX_CONNECTIONS}`, evidence: `command: ${pg.command}` });
      else if (found >= MIN_MAX_CONNECTIONS)
        rows.push({ service: 'postgres', check: 'max_connections', status: 'OK', note: `${found} ≥ ${MIN_MAX_CONNECTIONS}`, evidence: `command: ${pg.command}` });
      else
        rows.push({ service: 'postgres', check: 'max_connections', status: 'DANGEROUS', note: `${found} < ${MIN_MAX_CONNECTIONS} — 11 JVM pools sẽ cạn connection`, evidence: `command: ${pg.command}` });
    }
  }
  // (2)+(3) quét mọi service: flag lạ → WARN; JVM thiếu healthcheck → DANGEROUS
  for (const svc of compose.values()) {
    if (svc.command != null) {
      for (const tok of commandTokens(svc.command)) {
        if (/^-[A-Za-z]$/.test(tok)) continue; // single-char flag-passer (vd `postgres -c`) — không có ngữ nghĩa checklist đóng
        const m = tok.match(/^--?([A-Za-z_][A-Za-z0-9_-]*)(?:=(.*))?$/);
        if (!m) continue; // positional (postgres, server, /data...) — bỏ
        const flag = m[1];
        if (KNOWN_FLAGS[flag]) continue; // đã checklist ở (1)
        rows.push({ service: svc.name, check: `flag:${flag}`, status: 'WARN', note: 'flag ngoài bảng audit (KNOWN_FLAGS) — WARN non-finding, review tay', evidence: `command: ${svc.command}` });
      }
    }
    const isJvm = (svc.dockerfile || '').startsWith('backend/');
    if (isJvm && !svc.healthcheck)
      rows.push({ service: svc.name, check: 'healthcheck', status: 'DANGEROUS', note: 'JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart', evidence: `build dockerfile: ${svc.dockerfile}` });
  }
  return rows.sort((a, b) => a.service.localeCompare(b.service) || a.check.localeCompare(b.check));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) return runSelfTest(opts); // T9 — định nghĩa sau

  const compose = parseCompose(opts.compose);
  const ymlSources = collectYmlSources(opts.backend);
  const javaSources = collectJavaSources(opts.backend);
  const placeholders = extractPlaceholders(ymlSources, javaSources, opts.backend);

  // ── Trục (a) — bảng extract (T1): service × var ↔ compose set/unset ──────
  const envVars = placeholders.filter((p) => p.kind === 'env');
  const propRefs = placeholders.filter((p) => p.kind === 'prop-ref');
  console.log(`== config-audit: extract trục (a) — ${envVars.length} env-var, ${propRefs.length} prop-ref (chỉ đếm, không classify) ==`);
  console.log(`   nguồn: ${ymlSources.length} yml + ${javaSources.length} java · compose: ${compose.size} services\n`);
  let curSvc = null;
  for (const p of envVars) {
    if (p.service !== curSvc) { curSvc = p.service; console.log(`— ${curSvc}${compose.has(curSvc) ? '' : '  (không có entry compose)'}`); }
    const hasEntry = compose.has(p.service);
    const setInfo = !hasEntry ? '—' : compose.get(p.service).env.has(p.var)
      ? `SET=${maskValue(p.var, resolveComposeValue(compose.get(p.service).env.get(p.var)))}`
      : 'UNSET';
    console.log(`   ${p.var.padEnd(42)} default=${maskValue(p.var, p.default).padEnd(38)} compose=${setInfo}`);
    console.log(`     ↳ ${p.sources.join(', ')}`);
  }
  console.log(`\n== T1 extraction OK (classify A1 + exit semantics ghép ở T4/T5) ==`);

  // ── Trục (b) — volume mounts drift ───────────────────────────────────────
  const axisB = analyzeAxisB(compose, placeholders);
  console.log(`\n== Trục (b): ${axisB.length} path-requirement, ${axisB.filter((r) => r.status === 'DANGEROUS').length} DANGEROUS ==`);
  for (const r of axisB)
    console.log(`   [${r.status}] ${r.service} · ${r.var} · eff=${r.envVal != null ? r.envVal : maskValue(r.var, r.default)} — ${r.note}\n      ↳ ${r.evidence}`);

  // ── Trục (c) — closed checklist ──────────────────────────────────────────
  const axisC = analyzeAxisC(compose);
  console.log(`\n== Trục (c): ${axisC.length} check, ${axisC.filter((r) => r.status === 'DANGEROUS').length} DANGEROUS, ${axisC.filter((r) => r.status === 'WARN').length} WARN (non-finding) ==`);
  for (const r of axisC)
    console.log(`   [${r.status}] ${r.service} · ${r.check} — ${r.note}\n      ↳ ${r.evidence}`);
}

try { main(); } catch (e) {
  console.error(`config-audit: LỖI script (exit 2): ${e && e.stack ? e.stack : e}`);
  process.exit(2);
}
