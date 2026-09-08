/**
 * helpers/checkout.ts (SF-1 FI-369) — click nút trả thẻ Stripe CHỐNG mất
 * click. Nút "Thanh toán bằng thẻ" nằm dưới fold (y≈1170) và summary
 * re-render sau khi tạo đơn (dòng "Giảm giá −…" xuất hiện) — trusted click
 * toạ độ của Playwright có thể rơi vào lúc layout shift: Playwright tin là
 * đã click nhưng React handler không chạy (live-verify: `el.click()` bằng
 * JS fire ngay, click toạ độ mất thầm lặng — không error, không pay-error,
 * intent kẹt requires_payment_method). Retry đến khi phase đổi: label
 * "Đang xử lý thẻ…" (confirming) / navigate confirmation / .pay-error
 * (declined) — cùng pattern retry với addFirstVariantToCart (golden-path).
 */
import type { Page } from '@playwright/test';

export async function clickPayWithRetry(page: Page, attempts = 3): Promise<void> {
  const payBtn = page.getByRole('button', { name: /Thanh toán bằng thẻ/ });
  for (let i = 0; i < attempts; i++) {
    await payBtn.scrollIntoViewIfNeeded();
    await payBtn.click();
    for (let w = 0; w < 4; w++) {
      await page.waitForTimeout(1_000);
      const confirming = await page
        .getByRole('button', { name: /Đang xử lý thẻ/ })
        .isVisible()
        .catch(() => false);
      if (confirming || page.url().includes('confirmation')) return;
      const payError = await page
        .locator('.pay-error')
        .isVisible()
        .catch(() => false);
      if (payError) return;
    }
  }
}
