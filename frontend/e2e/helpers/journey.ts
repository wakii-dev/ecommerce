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
