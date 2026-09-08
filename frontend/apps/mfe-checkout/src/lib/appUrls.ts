/**
 * appUrls (FI-393 T4) — origin storefront cho CTA cross-origin (CartPage
 * empty-state "Về trang chủ", ConfirmationPage T9). CÙNG env + fallback với
 * shell `sfUrl()` (ShellSearch T2) — một nguồn sự thật duy nhất.
 * Cross-origin → caller dùng window.location.assign (full nav), KHÔNG appNavigate.
 */
export function storefrontUrl(): string {
  return (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:3000';
}
