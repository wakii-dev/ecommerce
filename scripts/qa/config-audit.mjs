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
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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

// ── Trục (a) — classify machine-checkable (A1) ───────────────────────────────
// DANGEROUS = default match localhost|127.0.0.1 + service có compose entry +
//              compose KHÔNG set var (pattern LOG_URI 9/9).
// OK         = compose set + alias-equivalence: cùng port + host là compose
//              service name, HOẶC set trùng default. Set localhost-family
//              KHÔNG được OK (trừ khi == default) — giữ bắt được bug flagship.
// WARN       = compose set nhưng lệch ngữ nghĩa (khác port / host lạ) — WARN
//              KHÔNG PHẢI finding, không ảnh hưởng exit.
// FE whitelist: default match :3000|:5173 HOẶC var match VITE_|STOREFRONT|SHELL
//              → SKIP (FE dev chạy host là chủ đích).
// Path file-system (FS_PATH_RE) → chuyển trục (b) xử lý (tránh so alias URLs).
function parseHostPort(v) {
  if (!v) return { host: null, port: null };
  // scheme lồng ghép: http://host:port · mongodb://mongo:27017 · jdbc:postgresql://pg:5432/db
  let m = v.match(/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)+(\/\/)?([^/:?#]+)(?::(\d+))?/);
  if (m && m[2] && !/^\d+$/.test(m[2])) return { host: m[2], port: m[3] ? Number(m[3]) : null };
  m = v.match(/^([^/:?#]+):(\d+)$/); // bare host:port
  if (m) return { host: m[1], port: Number(m[2]) };
  if (/^[^/:?#]+$/.test(v)) return { host: v, port: null }; // bare host
  return { host: null, port: null }; // scalar (true/full/...) — không phải host
}

function classifyAxisA(compose, placeholders) {
  const rows = [];
  for (const p of placeholders) {
    if (p.kind !== 'env') continue;
    const evidenceSrc = p.sources.join(', ');
    const svc = compose.get(p.service);
    if (!svc) { // không có entry compose — chạy host-only, không đối chiếu được
      rows.push({ ...p, status: 'SKIP-NOENTRY', note: 'service không có entry compose (host-only)', composeVal: null, evidence: evidenceSrc });
      continue;
    }
    if (FE_PORT_RE.test(p.default || '') || FE_VAR_RE.test(p.var)) {
      rows.push({ ...p, status: 'SKIP-FE', note: 'FE-host whitelist (dev :3000/:5173 hoặc tên var FE) — chủ đích, không flag', composeVal: null, evidence: evidenceSrc });
      continue;
    }
    if (p.default != null && FS_PATH_RE.test(p.default)) {
      rows.push({ ...p, status: 'SEE-AXIS-B', note: 'giá trị path file-system — trục (b) phân loại', composeVal: null, evidence: evidenceSrc });
      continue;
    }
    const hasVar = svc.env.has(p.var);
    const evidence = `${evidenceSrc} · compose ${hasVar ? `SET ${p.var}` : `không set ${p.var}`}`;
    if (!hasVar) {
      if (p.default == null)
        rows.push({ ...p, status: 'UNSET', note: 'compose không set, code không có default (Spring sẽ fail nếu cần) — không finding theo A1', composeVal: null, evidence });
      else if (p.default === '')
        rows.push({ ...p, status: 'UNSET', note: 'compose không set, default rỗng (optional theo design) — không finding', composeVal: null, evidence });
      else if (LOCALHOST_RE.test(p.default))
        rows.push({ ...p, status: 'DANGEROUS', note: `default ${maskValue(p.var, p.default)} trỏ localhost — container không tới được (pattern LOG_URI 9/9)`, composeVal: null, evidence });
      else
        rows.push({ ...p, status: 'UNSET', note: `compose không set — dùng default ${maskValue(p.var, p.default)} (không localhost, benign)`, composeVal: null, evidence });
      continue;
    }
    const raw = svc.env.get(p.var);
    const shape = composeValueShape(raw);
    if (shape.kind === 'hostref' && shape.tail === '') {
      // compose set rỗng `${X:-}` — trạng thái RIÊNG với UNSET (plan edge-case)
      const localhostDef = p.default != null && p.default !== '' && LOCALHOST_RE.test(p.default);
      rows.push({ ...p, status: localhostDef ? 'WARN' : 'SET-EMPTY', note: localhostDef
        ? 'compose set-rỗng nhưng code default trỏ localhost — cảnh báo (non-finding theo A1: "set")'
        : 'compose set-rỗng (${VAR:-}) — trạng thái set rỗng riêng với UNSET', composeVal: raw, evidence });
      continue;
    }
    const setVal = resolveComposeValue(raw); // hostref → tail khai báo (không đọc .env)
    if (SECRET_RE.test(p.var)) {
      // secret — KHÔNG so alias (không bao giờ in giá trị), chỉ cần biết SET
      rows.push({ ...p, status: 'OK', note: 'compose SET (masked) — secret không so alias', composeVal: raw, evidence });
      continue;
    }
    if (setVal === p.default) {
      rows.push({ ...p, status: 'OK', note: `compose set trùng default — OK`, composeVal: raw, evidence });
      continue;
    }
    const d = parseHostPort(p.default || '');
    const s = parseHostPort(setVal);
    const serviceName = compose.has(s.host || ' ');
    const samePort = d.port === s.port; // null == null → host-only value (vd RABBITMQ_HOST)
    if (serviceName && samePort)
      rows.push({ ...p, status: 'OK', note: `alias-equivalence: ${s.host ?? '(host rỗng)'} là compose service + cùng port → OK`, composeVal: raw, evidence });
    else if (serviceName)
      rows.push({ ...p, status: 'WARN', note: `set ${maskValue(p.var, setVal)} — host là compose service nhưng lệch port (${d.port ?? '—'} → ${s.port ?? '—'}) — WARN non-finding`, composeVal: raw, evidence });
    else if (s.host == null)
      rows.push({ ...p, status: 'WARN', note: `set ${maskValue(p.var, setVal)} khác default ${maskValue(p.var, p.default)} (giá trị vô hướng) — WARN non-finding`, composeVal: raw, evidence });
    else
      rows.push({ ...p, status: 'WARN', note: `set ${maskValue(p.var, setVal)} — host '${s.host}' không phải compose service name, lệch default — WARN non-finding`, composeVal: raw, evidence });
  }
  return rows.sort((a, b) => a.service.localeCompare(b.service) || a.var.localeCompare(b.var));
}

// ── Finding IDs ổn định (A11) + FIXED registry ───────────────────────────────
// ID = CFG-<trục>-<số 2 chữ số> đánh theo thứ tự deterministic trong axis
// (service, var/check). Registry scripts/qa/config-audit-fixed.json schema
// {findings:[{id, evidence, date}]} — ID khớp → status FIXED (không ảnh hưởng
// exit), script đọc MỖI run (A1).
function assignFindingIds(axisA, axisB, axisC) {
  const sortF = (k) => (a, b) => a.service.localeCompare(b.service) || (a[k] || '').localeCompare(b[k] || '');
  const out = { A: [], B: [], C: [] };
  out.A = axisA.filter((r) => r.status === 'DANGEROUS').sort(sortF('var'));
  out.B = axisB.filter((r) => r.status === 'DANGEROUS').sort(sortF('var'));
  out.C = axisC.filter((r) => r.status === 'DANGEROUS').sort(sortF('check'));
  for (const [axis, list] of Object.entries(out))
    list.forEach((r, i) => { r.id = `CFG-${axis}-${String(i + 1).padStart(2, '0')}`; });
  return out;
}

function loadFixedRegistry(file) {
  if (!existsSync(file)) fail(`Không tìm thấy FIXED registry: ${file}`);
  let obj;
  try { obj = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { fail(`FIXED registry hỏng (không parse được JSON): ${e.message}`); }
  if (!obj || !Array.isArray(obj.findings)) fail(`FIXED registry sai schema — cần {"findings":[{id,evidence,date}]}`);
  for (const f of obj.findings)
    if (!f || typeof f.id !== 'string' || typeof f.evidence !== 'string' || typeof f.date !== 'string')
      fail(`FIXED registry: finding thiếu id/evidence/date — ${JSON.stringify(f)}`);
  return new Set(obj.findings.map((f) => f.id));
}

// ── Report writer (T5) — marker-based, idempotent ────────────────────────────
// Mỗi script chỉ regen block `<!-- sf1:<section> -->` của mình: read → replace
// → write. Thiếu marker (file bị tay đụng) → append cuối, KHÔNG clobber block
// script khác. Thiếu file → sinh skeleton đầy đủ 7 section.
const REPORT_SECTIONS = ['summary', 'axis-a', 'axis-b', 'axis-c', 's2s', 'rbac', 'contracts'];
const SECTION_OWNER = {
  summary: 'config-audit.mjs', 'axis-a': 'config-audit.mjs', 'axis-b': 'config-audit.mjs',
  'axis-c': 'config-audit.mjs', s2s: 's2s-auth-matrix.mjs', rbac: 'rbac-matrix.mjs',
  contracts: 'contracts-freshness.mjs',
};
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function reportSkeleton() {
  const body = REPORT_SECTIONS
    .map((s) => `<!-- sf1:${s} -->\n(chờ ${SECTION_OWNER[s]} ghi)\n<!-- /sf1:${s} -->`)
    .join('\n\n');
  return [
    '# QA Static Audit — SF-1 (FI-405)', '',
    '> Report marker-based: MỖI script regen block `<!-- sf1:<section> -->` của mình',
    '> (read → replace → write, idempotent re-run). Block do script sinh — KHÔNG sửa tay.',
    `> config-audit.mjs: summary + axis-a/b/c · s2s-auth-matrix.mjs: s2s ·`,
    '> rbac-matrix.mjs: rbac · contracts-freshness.mjs: contracts.',
    '> Exit semantics chung 4 script: 0 = 0 finding CHƯA fix · 1 = ≥1 finding CHƯA fix · 2 = script error.',
    '', body, '',
  ].join('\n');
}

function upsertSection(reportPath, section, content) {
  if (!REPORT_SECTIONS.includes(section)) fail(`Section lạ '${section}' — không thuộc report schema`);
  let text;
  if (existsSync(reportPath)) text = readFileSync(reportPath, 'utf8');
  else text = reportSkeleton();
  const open = `<!-- sf1:${section} -->`;
  const close = `<!-- /sf1:${section} -->`;
  const re = new RegExp(`${escRe(open)}[\\s\\S]*?${escRe(close)}`);
  const replacement = `${open}\n${content}\n${close}`;
  const next = re.test(text) ? text.replace(re, replacement) : `${text}\n${replacement}\n`;
  writeFileSync(reportPath, next);
}

function mdTable(header, rows) {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}
const trunc = (s, n = 60) => (s == null ? '—' : String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

function buildAxisContent(axisA, axisB, axisC, findings) {
  const parts = [];
  // axis-a
  const cnt = {};
  for (const r of axisA) cnt[r.status] = (cnt[r.status] || 0) + 1;
  const aRows = axisA
    .filter((r) => r.status !== 'SKIP-NOENTRY')
    .map((r) => [r.service, r.var, r.status, trunc(maskValue(r.var, r.default)), trunc(maskValue(r.var, r.composeVal != null ? resolveComposeValue(r.composeVal) : null))]);
  const aFind = findings.A.map((f) => [f.id, f.service, f.var, trunc(f.note, 120), trunc(f.evidence, 120)]);
  const aWarn = axisA.filter((r) => r.status === 'WARN').map((r) => [r.service, r.var, trunc(maskValue(r.var, r.composeVal != null ? resolveComposeValue(r.composeVal) : null), 40), trunc(r.note, 110)]);
  parts.push([
    '### Trục (a) — env var code ↔ compose (A1)', '',
    `Đối chiếu ${axisA.length} env-var. Trạng thái: ${Object.entries(cnt).map(([k, v]) => `${k}=${v}`).join(' · ')}. WARN/UNSET/SKIP **không phải finding**.`,
    '', '**Findings DANGEROUS:**', '',
    mdTable(['ID', 'service', 'var', 'ghi chú', 'evidence'], aFind.length ? aFind : [['—', '—', '—', '0 finding', '—']]),
    '', '**WARN (non-finding, không ảnh hưởng exit):**', '',
    mdTable(['service', 'var', 'compose', 'ghi chú'], aWarn.length ? aWarn : [['—', '—', '—', '0 WARN']]),
    '', `**Bảng đầy đủ** (default/compose masked theo policy secret; SKIP-NOENTRY=${cnt['SKIP-NOENTRY'] || 0} var của service không có entry compose — lược):`, '',
    mdTable(['service', 'var', 'status', 'default', 'compose'], aRows),
  ].join('\n'));
  // axis-b
  const bRows = axisB.map((r) => [r.service, r.var, trunc(r.envVal != null ? r.envVal : r.default, 46), trunc(r.targets.join(', ') || '—', 30), r.status, trunc(r.note, 90)]);
  const bFind = findings.B.map((f) => [f.id, f.service, f.var, trunc(f.note, 120), trunc(f.evidence, 120)]);
  parts.push([
    '### Trục (b) — volume mounts drift (A6)', '',
    `${axisB.length} path-requirement (code default + compose env) so container-target volume của chính service.`,
    '', '**Findings DANGEROUS:**', '',
    mdTable(['ID', 'service', 'var', 'ghi chú', 'evidence'], bFind.length ? bFind : [['—', '—', '—', '0 finding', '—']]),
    '', '**Bảng đầy đủ:**', '',
    mdTable(['service', 'var', 'path hiệu lực', 'volume targets', 'status', 'ghi chú'], bRows),
  ].join('\n'));
  // axis-c
  const cRows = axisC.map((r) => [r.service, r.check, r.status, trunc(r.note, 100)]);
  const cFind = findings.C.map((f) => [f.id, f.service, f.check, trunc(f.note, 120), trunc(f.evidence, 120)]);
  parts.push([
    '### Trục (c) — compose value drift, closed checklist (A7)', '',
    '(1) postgres `max_connections` ≥ 110 · (2) healthcheck per JVM service · (3) flag ngoài bảng KNOWN_FLAGS → WARN.',
    '', '**Findings DANGEROUS:**', '',
    mdTable(['ID', 'service', 'check', 'ghi chú', 'evidence'], cFind.length ? cFind : [['—', '—', '—', '0 finding', '—']]),
    '', '**Bảng đầy đủ:**', '',
    mdTable(['service', 'check', 'status', 'ghi chú'], cRows),
  ].join('\n'));
  return parts;
}

function writeReport(opts, data) {
  const { axisA, axisB, axisC, findings, unfixed, fixedCount, exitCode } = data;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const totalUnfixed = unfixed.A + unfixed.B + unfixed.C;
  const summary = [
    `**config-audit** run ${now} — compose \`${relative(REPO, opts.compose)}\` · backend \`${relative(REPO, opts.backend)}\``,
    '',
    '| Trục | Kiểm | DANGEROUS | UNFIXED | FIXED (registry) | WARN (non-finding) |',
    '| --- | --- | --- | --- | --- | --- |',
    `| (a) env var | ${axisA.length} | ${findings.A.length} | ${unfixed.A} | ${fixedCount && findings.A.some((f) => f.status === 'FIXED') ? findings.A.filter((f) => f.status === 'FIXED').length : 0} | ${axisA.filter((r) => r.status === 'WARN').length} |`,
    `| (b) volume mount | ${axisB.length} | ${findings.B.length} | ${unfixed.B} | ${findings.B.filter((f) => f.status === 'FIXED').length} | — |`,
    `| (c) compose checklist | ${findings.allC.length} | ${findings.C.length} | ${unfixed.C} | ${findings.C.filter((f) => f.status === 'FIXED').length} | ${findings.allC.filter((r) => r.status === 'WARN').length} |`,
    '',
    `**Exit config-audit: \`${exitCode}\`** — legend: \`0\` = 0 finding CHƯA fix · \`1\` = ≥1 finding CHƯA fix · \`2\` = script error. Tổng unfixed: **${totalUnfixed}** (finding ID \`CFG-xx\`; FIXED registry \`scripts/qa/config-audit-fixed.json\`).`,
    '',
    '> Bảng exit ĐỦ 4 script (config-audit · s2s · rbac · contracts) do recipe `make qa-audit` ghi',
    '> vào block này SAU KHI đủ 4 exit — script standalone KHÔNG biết exit của script khác.',
  ].join('\n');
  const [aC, bC, cC] = buildAxisContent(axisA, axisB, axisC, findings);
  upsertSection(opts.report, 'summary', summary);
  upsertSection(opts.report, 'axis-a', aC);
  upsertSection(opts.report, 'axis-b', bC);
  upsertSection(opts.report, 'axis-c', cC);
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

  // ── T4: classify trục (a) + gom findings + FIXED registry ────────────────
  const axisA = classifyAxisA(compose, placeholders);
  const statCount = {};
  for (const r of axisA) statCount[r.status] = (statCount[r.status] || 0) + 1;
  console.log(`\n== Trục (a) classify A1: ${axisA.length} env-var đối chiếu ==`);
  console.log(`   trạng thái: ${Object.entries(statCount).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  for (const r of axisA) {
    if (['DANGEROUS', 'WARN', 'SEE-AXIS-B'].includes(r.status)) {
      console.log(`   [${r.status}] ${r.service} · ${r.var} — ${r.note}\n      ↳ ${r.evidence}`);
    } else {
      console.log(`   [${r.status}] ${r.service} · ${r.var}`); // compact — chi tiết note chỉ với row đáng chú ý
    }
  }
  const findings = assignFindingIds(axisA, axisB, axisC);
  const fixed = loadFixedRegistry(opts.fixed);
  let fixedCount = 0;
  for (const list of Object.values(findings))
    for (const f of list) if (fixed.has(f.id)) { f.status = 'FIXED'; fixedCount++; }
  const unfixed = { A: 0, B: 0, C: 0 };
  for (const [ax, list] of Object.entries(findings))
    unfixed[ax] = list.filter((f) => f.status !== 'FIXED').length;
  console.log(`\n== Findings DANGEROUS (CFG-xx): A=${findings.A.length} B=${findings.B.length} C=${findings.C.length} · FIXED theo registry: ${fixedCount} · UNFIXED: A=${unfixed.A} B=${unfixed.B} C=${unfixed.C} ==`);
  for (const [ax, list] of Object.entries(findings))
    for (const f of list)
      console.log(`   ${f.id} [${f.status}] ${f.service} · ${f.var || f.check} — ${f.note}\n      ↳ ${f.evidence}`);

  // ── T5: exit semantics (0 = 0 unfixed finding · 1 = ≥1 · 2 = script error) ─
  const exitCode = unfixed.A + unfixed.B + unfixed.C > 0 ? 1 : 0;
  findings.allC = axisC; // bảng đầy đủ trục (c) cho summary
  writeReport(opts, { axisA, axisB, axisC, findings, unfixed, fixedCount, exitCode });
  console.log(`\n== config-audit EXIT=${exitCode} — unfixed A=${unfixed.A} B=${unfixed.B} C=${unfixed.C}, FIXED=${fixedCount} ==`);
  console.log(`   report: ${relative(REPO, opts.report)} — regen summary + axis-a/b/c (s2s/rbac/contracts giữ nguyên)`);
  return exitCode;
}

try { process.exit(main()); } catch (e) {
  console.error(`config-audit: LỖI script (exit 2): ${e && e.stack ? e.stack : e}`);
  process.exit(2);
}
