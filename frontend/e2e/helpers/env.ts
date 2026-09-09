/**
 * helpers/env.ts (SF-10) — cấu hình suite + Stripe parameterization + preflight.
 *
 * STRIPE KEYS: .env của user (gitignored). Placeholder `sk_test_xxx` (từ
 * .env.example) coi như KHÔNG có key (plan-critic P1 — payment sẽ 401 thay
 * vì degraded sạch). hasStripe() = secret + publishable + webhook secret đều
 * thật (SF-1: + whsec_ — golden path PAID đi qua webhook, thiếu whsec =
 * không bao giờ CONFIRMED dù sk+pk có thật).
 */

function readEnvFile(): Record<string, string> {
  // Playwright chạy từ frontend/e2e — .env ở repo root (3 cấp trên)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');
    const envPath = path.resolve(__dirname, '../../../.env');
    if (!fs.existsSync(envPath)) return {};
    const out: Record<string, string> = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const FILE_ENV = readEnvFile();

export function env(name: string): string {
  return process.env[name] ?? FILE_ENV[name] ?? '';
}

export const STOREFRONT = env('E2E_STOREFRONT_URL') || 'http://localhost:3000';
// SF-3: shell routes đi qua entry :3000 (Next rewrites) — 1 URL
export const SHELL = env('E2E_SHELL_URL') || 'http://localhost:3000';
// GATEWAY_URL single-source (FI-366 SF-1 T12): đọc `GATEWAY_URL` từ .env như
// mọi file khác (13-file grep-verified); E2E_GATEWAY_URL giữ làm override
// legacy. Default chỉ là documented fallback — nguồn giá trị = .env.
export const GATEWAY = env('GATEWAY_URL') || env('E2E_GATEWAY_URL') || 'http://localhost:8080';
export const MAILPIT_API = 'http://localhost:8025';
export const ADMIN_EMAIL = env('ADMIN_EMAIL') || 'admin@demo.vn';
export const ADMIN_PASSWORD = env('ADMIN_PASSWORD') || 'admin123';

const PLACEHOLDER = /xxx$/;

export function hasStripe(): boolean {
  const sk = env('STRIPE_SECRET_KEY');
  const pk = env('VITE_STRIPE_PUBLISHABLE_KEY');
  const wh = env('STRIPE_WEBHOOK_SECRET');
  return (
    sk !== '' &&
    !PLACEHOLDER.test(sk) &&
    sk.startsWith('sk_test_') &&
    pk !== '' &&
    !PLACEHOLDER.test(pk) &&
    pk.startsWith('pk_test_') &&
    wh !== '' &&
    !PLACEHOLDER.test(wh) &&
    wh.startsWith('whsec_')
  );
}

/** Preflight — fail nhanh kèm hướng dẫn (chạy 1 lần trong global setup). */
export async function preflight(): Promise<void> {
  const checks: Array<[string, () => Promise<Response>]> = [
    [`gateway ${GATEWAY}`, () => fetch(`${GATEWAY}/actuator/health`)],
    [`storefront ${STOREFRONT}`, () => fetch(`${STOREFRONT}/`)],
    [`shell ${SHELL}`, () => fetch(SHELL)],
    [`mailpit ${MAILPIT_API}`, () => fetch(`${MAILPIT_API}/api/v1/messages`)]
  ];
  for (const [name, probe] of checks) {
    try {
      const res = await probe();
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    } catch {
      throw new Error(
        `✗ ${name} không truy cập được — chạy \`make dev\` (full stack) trước khi e2e. ` +
          `Chi tiết: docs/demo-script.md quickstart`
      );
    }
  }
}
