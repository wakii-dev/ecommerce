/**
 * helpers/journey.ts (SF-3 FI-407) — helper dùng chung 2 journey specs mới.
 * KHÔNG sửa helpers hiện có (env/api/checkout — pack touch map). Credentials
 * admin lấy từ helpers/env (ADMIN_EMAIL/ADMIN_PASSWORD — .env hoặc seed
 * default) — KHÔNG hardcode secret trong spec (security-audit gate).
 * Re-login ĐẦU MỖI SECTION (JWT 15' — pack §3; không giữ storageState xuyên 15').
 */
import { expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, SHELL } from './env';

/** UI login (email bất kỳ) — chờ rời /login. Pattern uiLogin golden-path. */
export async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
}

/** UI login ADMIN → khu quản trị mở. */
export async function adminUiLogin(page: Page): Promise<void> {
  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

/**
 * Inject stale guest cart (FI-407 lớp 3b): GHI ĐÈ key `cart:guest:<token>`
 * bằng CartDocument JSON có line variantId NULL — mô phỏng data cũ trước seed
 * fix. Shape khớp records CartModels.java (LineItem 9 field; CartDocument:
 * items/updatedAt/email). Redis exec theo pattern pgExec: E2E_REDIS_CONTAINER
 * (rig isolate) hoặc `docker compose exec -T redis` (spec-critic P2).
 * execFileSync ARG-ARRAY — JSON không đi qua /bin/sh (FI-402 P0 pattern).
 */
export async function injectStaleGuestCart(input: {
  guestToken: string;
  productId: string;
  slug: string;
  name: string;
  unitPrice: number;
}): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  const path = require('node:path') as typeof import('node:path');
  const repoRoot = path.resolve(__dirname, '../../..');
  const doc = {
    items: [
      {
        id: crypto.randomUUID(),
        productId: input.productId,
        variantId: null, // STALE — dòng cũ trước seed fix
        qty: 1,
        slug: input.slug,
        name: input.name,
        image: '',
        unitPrice: input.unitPrice,
        unavailable: false
      }
    ],
    updatedAt: new Date().toISOString(),
    email: null
  };
  const container = process.env.E2E_REDIS_CONTAINER;
  // EX 30 ngày (khớp cart.ttl-days default) — SET trần không TTL để lại key
  // mồ côi khi run 3b fail giữa chừng (code-review P2 hygiene)
  const { args, cmd } = container
    ? { args: ['exec', container, 'redis-cli', 'SET', `cart:guest:${input.guestToken}`, JSON.stringify(doc), 'EX', '2592000'], cmd: 'docker' }
    : { args: ['compose', 'exec', '-T', 'redis', 'redis-cli', 'SET', `cart:guest:${input.guestToken}`, JSON.stringify(doc), 'EX', '2592000'], cmd: 'docker' };
  execFileSync(cmd, args, { encoding: 'utf8', cwd: repoRoot });
}
