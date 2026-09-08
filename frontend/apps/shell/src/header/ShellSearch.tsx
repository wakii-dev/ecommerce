import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';

/**
 * Search của shell header (FI-393 T2) — form GET native: submit điều hướng
 * full-page sang storefront `${sfUrl()}/search?q=...` (cross-origin đúng chỗ —
 * KHÔNG SPA navigate). Đơn giản hóa từ storefront SearchBar: KHÔNG
 * suggest/autocomplete (spec SF-3 T2).
 *
 * Origin: env `VITE_STOREFRONT_URL` (Vite bake lúc start — đổi env phải restart);
 * thiếu → fallback localhost:3000 (href thôi, không fetch — shell vẫn chạy).
 * Export helper cho ShellMiniNav (cùng origin, cùng fallback).
 */
export const sfUrl = (): string =>
  (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:3000';

export default function ShellSearch(): ReactElement {
  const { t } = useT();
  return (
    <form className="shell-search" role="search" action={`${sfUrl()}/search`} method="get">
      <input
        name="q"
        type="search"
        placeholder={t('shell.search.placeholder')}
        aria-label={t('shell.search.placeholder')}
      />
      <button type="submit">{t('shell.search.submit')}</button>
    </form>
  );
}
