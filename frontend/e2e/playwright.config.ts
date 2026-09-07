import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E (SF-10) — KHÔNG webServer: suite chạy với dev stack ĐANG SỐNG
 * (`make dev`) + Mailpit/Mongo/ES từ compose. Preflight trong helpers/env.ts
 * fail FAST với hướng dẫn nếu thiếu.
 *
 * Stripe parameterization (coordinator duyệt 2026-09-07 — REQUIREMENT-GAP
 * FI-310): hasStripe() = STRIPE_SECRET_KEY + VITE_STRIPE_PUBLISHABLE_KEY có
 * thật (không placeholder) → golden path chạy full 4242→CONFIRMED; ngược lại
 * chỉ assert tới tạo đơn/FAILED-path, các assert CONFIRMED/email/verified
 * skip với tag [PENDING-STRIPE-KEYS].
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // golden path chia sẻ state seed + Mailpit — chạy serial
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    // disk máy dev chật — trace/screenshot OFF (bật tay khi debug:
    // `playwright test --trace on`)
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  }
});
