import { expect, test } from '@playwright/test';
import { GATEWAY, MAILPIT_API, SHELL } from '../helpers/env';
import { mailpitMessages, registerNewUser } from '../helpers/api';

/**
 * SF-13 A1 (Task 12): quên mật khẩu → Mailpit link → đặt MK mới → login MK
 * mới OK; email lạ → thông báo giống hệt (anti-enumeration).
 */
test.describe.configure({ mode: 'serial' });

let user: { email: string; password: string };

test.beforeAll(async () => {
  user = await registerNewUser('reset13');
});

test('1 — forgot email lạ → thông báo không lộ (giống email thật)', async ({ page }) => {
  await page.goto(`${SHELL}/forgot-password`);
  await page.getByTestId('forgot-email').fill('khong-ton-tai-e2e@demo.vn');
  await page.getByTestId('forgot-submit').click();
  await expect(page.getByTestId('forgot-sent')).toBeVisible({ timeout: 10_000 });
});

test('2 — forgot → Mailpit link → reset MK mới → login được', async ({ page, request }) => {
  // 1. forgot (API qua gateway — contract 202 luôn)
  const forgot = await request.post(`${GATEWAY}/api/identity/password/forgot`, {
    data: { email: user.email }
  });
  expect(forgot.status()).toBe(202);

  // 2. Mailpit: tìm mail reset chứa token
  let link = '';
  await expect
    .poll(
      async () => {
        const messages = await mailpitMessages();
        const mail = messages.find(
          (m) => m.To.some((t) => t.Address === user.email) && /Đặt lại mật khẩu/i.test(m.Subject)
        );
        if (!mail) return '';
        const detail = await request.get(`${MAILPIT_API}/api/v1/message/${mail.ID}`);
        const body = await detail.text();
        const match = body.match(/https?:\/\/[^"\\]*\/reset-password\?token=[A-Za-z0-9_-]+/);
        link = match ? match[0].replace(/\\(?:["\/])/g, '') : '';
        return link;
      },
      { timeout: 20_000, intervals: [1_000, 2_000] }
    )
    .not.toBe('');

  // 3. mở trang reset (shell) — token từ link
  const token = new URL(link).searchParams.get('token') ?? '';
  await page.goto(`${SHELL}/reset-password?token=${token}`);
  await page.getByTestId('reset-password-input').fill('NewPass#2026');
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-success')).toBeVisible({ timeout: 10_000 });

  // 4. MK cũ chết, MK mới sống (UI login)
  await page.goto(`${SHELL}/login`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(user.password);
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeVisible({
    timeout: 10_000
  }); // vẫn ở login = MK cũ chết

  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('NewPass#2026');
  await page.getByRole('button', { name: /Đăng nhập/ }).click();
  await expect(page.getByRole('button', { name: /Đăng nhập/ })).toBeHidden({ timeout: 15_000 });
});
