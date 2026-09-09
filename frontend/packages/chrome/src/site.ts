/**
 * Site URL helpers (FI-398 T6, spec §3.4) — module config thuần (KHÔNG DOM,
 * KHÔNG process.env, KHÔNG import.meta.env trong chrome source — host app gọi
 * setChromeSite() lúc bootstrap, helper đọc-lúc-gọi nên unit override được).
 *
 * Defaults absolute (standalone/dev): shell 5173, storefront 3000. Shell host
 * pin (P1 critic): `setChromeSite({ sfUrl: VITE_STOREFRONT_URL, shellUrl: '' })`
 * — shellUrl '' = same-origin relative (link ra /cart đúng ở mọi port kể cả rig
 * +500, pre-align SF-3). Next (SF-4) set từ process env của nó.
 */

/** Config host truyền vào setChromeSite — field bỏ qua/undefined giữ nguyên. */
export interface ChromeSiteConfig {
  shellUrl?: string;
  sfUrl?: string;
}

/** Locale storefront — chỉ vi|en (khớp storefront lib/format.ts). */
export type Locale = 'vi' | 'en';

let siteCfg: Required<ChromeSiteConfig> = {
  shellUrl: 'http://localhost:5173',
  sfUrl: 'http://localhost:3000'
};

/** Merge config host (undefined = giữ nguyên — KHÔNG ghi đè default bằng undefined). */
export function setChromeSite(next: ChromeSiteConfig): void {
  if (next.shellUrl !== undefined) siteCfg.shellUrl = next.shellUrl;
  if (next.sfUrl !== undefined) siteCfg.sfUrl = next.sfUrl;
}

/** Origin shell (cart/account là trang shell — KHÔNG phải route Next). */
export function shellUrl(): string {
  return siteCfg.shellUrl;
}

/** Origin storefront (Danh mục là route Next /c/<slug>). */
export function sfUrl(): string {
  return siteCfg.sfUrl;
}

/**
 * Đường path theo locale — port EXACT từ storefront lib/format.ts localePath:
 * vi → path nguyên bản (không prefix — middleware rewrite `/`→`/vi`);
 * en → prefix `/en` — giữ nguyên `/` dẫn đầu (`/c/foo` → `/en/c/foo`),
 * root `/` → `/en/` (không link `/en` bare). KHÔNG guard idempotent (khớp
 * nguồn — path đã prefix sẽ double-prefix; storefront strip qua
 * switchLocalePath trước khi gọi).
 */
export function localePath(path: string, lang: Locale): string {
  if (lang !== 'en') return path;
  return path === '/' ? '/en/' : `/en${path}`;
}
