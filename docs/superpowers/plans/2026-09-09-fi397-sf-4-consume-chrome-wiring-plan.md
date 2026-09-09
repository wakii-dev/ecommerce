# SF-4 consume-chrome-wiring (FI-401) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** storefront-web + shell THẬT SỰ dùng chung `@ecommerce/chrome` — swap Header/Footer/ThemeToggle Next sang chrome, xóa dup + wrapper, bootstrap MFE đăng ký trực tiếp — demo "sửa 1 chỗ đổi 2 app" trên entry 1-origin :3000.

**Architecture:** chrome `SiteHeader` props-slots (SSR render props TRƯỚC registry SAU — links vào HTML đầu) + chrome `Footer`; client gate `ChromeShell` gọi `initI18n` + `changeLanguage` + `setChromeSite` cả 2 phía server/client; islands storefront GIỮ (SearchBar/LocaleSwitcher/MiniNav/NewsletterForm/PwaRegister/GaPageview/LiveChat); MFE bootstrap binding inline từ chrome — wrapper file XÓA.

**Tech Stack:** Next 14 App Router · React 18 · `@ecommerce/chrome` (workspace TS source, transpilePackages sẵn) · `@ecommerce/i18n` (i18next 23.16.8 — resources-inline init SYNC) · vitest (node env, include `tests/**/*.test.ts`) · Playwright e2e.

**Linear Issue:** FI-401 · Spec: `docs/superpowers/specs/2026-09-09-fi397-sf-4-consume-chrome-wiring-design.md` (spec-critic PROCEED round 2) · Pack: `docs/superpowers/contexts/fi397-sf-4.md` (main checkout).

**Mapping bracket → plan:** bracket task 1+6 → PT1 · 2+3 → PT2 · 5 → PT3 · 10 → PT4 · 7 → PT5 · 8 → PT6 · 4+9 → PT7 (coordinator — Rule 0).

---

## Task Dependencies (DAG)

```
PT1 (layout swap + i18n wire) ──► PT2 (delete dup + theme) ──► PT5 (unit sweep xanh)
        │                              │                              │
        │                              └──────► PT4 (shell-url cleanup)┘
        └──► PT3 (MFE bootstrap direct — song song PT2, KHÁCH file) ──┘
PT5 ──► PT6 (e2e subset trên rig) ──► PT7 (GA/livechat evidence + walkthrough — coordinator)
```

Chạy TUẦN TỰ PT1→PT7 (shared worktree — commit race memory: serialize; PT3 có thể chạy ngay sau PT1 nếu PT2 vướng, khác hoàn toàn file).

**Accepted limitations (ghi vào audit log, KHÔNG re-open):**
- Server i18n singleton per-process: 2 request /vi + /en ĐỒNG THỜI có thể interleave `changeLanguage` → 1 request render nhầm locale (client tự sửa ngay khi hydrate). Sequential e2e không bắt được. Fix đúng (clone instance + Provider) bị chặn bởi read-only `packages/i18n` + dep freeze.
- `SessionBootProvider` không nhận options (chrome component) — loginPath giữ default `/login` trong khi `lib/account-session.ts` dùng `/account`; inert hôm nay (chỉ AdminApp đọc getLoginPath) — comment tại chỗ wire.

---

### Task PT1: Layout swap chrome — dep + ChromeShell + i18n/setChromeSite wire (bracket 1+6)

**Files:**
- Modify: `frontend/apps/storefront-web/package.json` (thêm dep)
- Create: `frontend/apps/storefront-web/components/ChromeShell.tsx`
- Modify: `frontend/apps/storefront-web/app/[locale]/layout.tsx`
- Modify: `frontend/apps/storefront-web/app/layout.tsx` (nguồn THEME_BOOT_SCRIPT + css order — P1-2)
- Test (TDD — viết TRƯỚC): `frontend/apps/storefront-web/tests/chrome-layout.test.ts`

- [ ] **Step 1.1 — Dep chrome (spec-critic P0-1).** Sửa `frontend/apps/storefront-web/package.json` — trong `dependencies` thêm (giữ alphabet: sau `@ecommerce/contracts`):

```json
    "@ecommerce/chrome": "workspace:*",
```

Rồi:
```bash
cd frontend && pnpm install --prefer-offline
```
Expected: install OK; `git diff --stat pnpm-lock.yaml` — CHỈ mục importers storefront-web đổi (0 package registry mới). ⚠ Nếu dev server đang chạy → restart (dep mới trong app = server stale, memory SF-1).

- [ ] **Step 1.2 — Test TRƯỚC (TDD).** Tạo `frontend/apps/storefront-web/tests/chrome-layout.test.ts` (node env — KHÔNG cần docblock jsdom; KHÔNG dùng .tsx — vitest include chỉ `*.test.ts`, P0-4):

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// P2-1 critic: mock ĐỦ module next/navigation (next/link tự gọi useRouter)
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'vi' }),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  useSelectedLayoutSegment: () => undefined,
  useSelectedLayoutSegments: () => [],
}));

import ChromeShell from '../components/ChromeShell';
import { initI18n } from '@ecommerce/i18n';

beforeAll(async () => {
  await initI18n({ lang: 'vi' });
});

/** Render ChromeShell — children là <main> giả thay page tree. */
function renderShell(): string {
  return renderToStaticMarkup(
    createElement(ChromeShell, { locale: 'vi' }, createElement('main', null, 'page-body'))
  );
}

describe('chrome layout swap (SF-4 pack item 7 — markup nguồn chrome)', () => {
  it('header scaffolding chrome + slots + row2 mini-nav', () => {
    const html = renderShell();
    expect(html).toContain('chrome-header');
    expect(html).toContain('data-slot="left"');
    expect(html).toContain('data-slot="center"');
    expect(html).toContain('data-slot="right"');
    expect(html).toContain('chrome-header__row2');
    expect(html).toContain('mini-nav');
  });

  it('nav links trong HTML đầu (SSR — nav-honesty/SEO): /cart, /account, /c/dien-tu', () => {
    const html = renderShell();
    expect(html).toContain('href="/cart"');
    expect(html).toContain('href="/account"');
    expect(html).toContain('/c/dien-tu');
  });

  it('labels dịch qua useT (không provider) — chrome.header.aria + COPY storefront giữ', () => {
    const html = renderShell();
    expect(html).toContain('Trang chủ'); // chrome.header.aria
    expect(html).toContain('Giỏ hàng');  // lib/i18n COPY (island giữ)
  });

  it('footer chrome + newsletter island giữ trong band', () => {
    const html = renderShell();
    expect(html).toContain('chrome-site-footer');
    expect(html).toContain('site-footer--chrome');
    expect(html).toContain('Đăng ký nhận tin'); // NewsletterForm (SF-13 island)
  });
});
```

Chạy: `cd frontend/apps/storefront-web && pnpm vitest run tests/chrome-layout.test.ts`
Expected: **FAIL** — `Cannot find module '../components/ChromeShell'` (chưa tồn tại).

- [ ] **Step 1.3 — ChromeShell.tsx.** Tạo `frontend/apps/storefront-web/components/ChromeShell.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { initI18n } from '@ecommerce/i18n';
import {
  Footer,
  SessionBootProvider,
  SiteHeader,
  ThemeToggle,
  localePath,
  setChromeSite,
  shellUrl,
} from '@ecommerce/chrome';

import { t } from '../lib/i18n';
import LocaleSwitcher from './LocaleSwitcher';
import NewsletterForm from './NewsletterForm';
import SearchBar from './SearchBar';

type Locale = 'vi' | 'en';

/**
 * ChromeShell (SF-4 FI-401) — client gate bọc chrome tree: initI18n +
 * changeLanguage (URL locale — P0-2 critic: initI18n memoized first-call-wins
 * nên init một mình KHÔNG đủ khi SPA-nav đổi locale) + setChromeSite
 * (same-origin relative). Server layout gọi CÙNG bộ trước render (SSR pass
 * chắc chắn dịch — chrome instance là singleton PER RUNTIME, server khác
 * browser). SessionBootProvider mount không options — co-exist với
 * lib/account-session (cùng refreshUrl; authStore.refresh single-flight
 * per-tab → không double POST; loginPath default '/login' inert — chỉ
 * AdminApp đọc getLoginPath).
 *
 * Header: chrome SiteHeader props-slots (SSR render props TRƯỚC registry SAU
 * — links vào HTML đầu cho nav-honesty/SEO). Slot components mỏng 0-arg —
 * SiteHeader render <Component /> KHÔNG props → locale đọc qua useParams().
 * Class FI-390 GIỮ NGUYÊN (.logo/.search-*/.header-actions/.header-action/
 * .locale-switch/.mini-nav) — chỉ scaffolding wrapper đổi sang chrome
 * (.chrome-header + .site-header cùng element; app.css import SAU chrome.css
 * → storefront values thắng).
 *
 * Footer: chrome Footer (labels chrome.footer.* — đi qua t-provider; sửa 1
 * nhãn đổi CẢ 2 app) + NewsletterForm island (SF-13 — chrome không render,
 * pack để SF-4 quyết) trong cùng band .site-footer--chrome.
 */

function useLocaleFromParams(): Locale {
  const params = useParams();
  return params?.locale === 'en' ? 'en' : 'vi';
}

function SlotLogo(): ReactElement {
  const locale = useLocaleFromParams();
  return (
    <Link className="logo" href={localePath('/', locale)} aria-label={t(locale, 'header.logo')}>
      <span className="logo-word">
        ShopVN
        <span className="logo-dot" aria-hidden="true" />
      </span>
      <span className="logo-ticker">{t(locale, 'header.ticker')}</span>
    </Link>
  );
}

function SlotSearch(): ReactElement {
  const locale = useLocaleFromParams();
  return <SearchBar locale={locale} />;
}

/** Actions nguyên khối — markup cũ .header-actions giữ nguyên vị trí class. */
function SlotActions(): ReactElement {
  const locale = useLocaleFromParams();
  return (
    <div className="header-actions">
      <LocaleSwitcher locale={locale} />
      {/* SF-4: chrome ThemeToggle (icon-only 42×42 — FI-390 direction §2.1; label
          Tối/Sáng cũ thành sr-only — delta CHẤP NHẬN theo direction). */}
      <ThemeToggle />
      {/* Cart/account GIỮ LINK relative (pack item 8: chrome Header phải render
          links /cart|/account tương tự — nav-honesty). */}
      <a className="header-action" href={`${shellUrl()}/cart`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="19.5" r="1.5" />
          <circle cx="16.5" cy="19.5" r="1.5" />
        </svg>
        <span className="header-action-label">{t(locale, 'header.cart')}</span>
      </a>
      <a className="header-action" href={`${shellUrl()}/account`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" strokeLinecap="round" />
        </svg>
        <span className="header-action-label">{t(locale, 'header.account')}</span>
      </a>
    </div>
  );
}

/** Mini-nav (row2) — markup cũ GIỮ (e2e `nav.mini-nav` 3 link sort thật). */
function SlotMiniNav(): ReactElement {
  const locale = useLocaleFromParams();
  return (
    <nav className="mini-nav" aria-label={t(locale, 'header.quickNav')}>
      <div className="container mini-nav-inner">
        <Link href={localePath('/c/dien-tu', locale)}>{t(locale, 'header.categories')}</Link>
        <Link className="accent" href={localePath('/c/dien-tu?sort=newest', locale)}>{t(locale, 'header.newArrivals')}</Link>
        <Link className="accent" href={localePath('/c/dien-tu?sort=rating', locale)}>{t(locale, 'header.bestSellers')}</Link>
      </div>
    </nav>
  );
}

export default function ChromeShell({ locale, children }: { locale: Locale; children: ReactNode }): ReactElement {
  // Per-render idempotent (first-call-wins instance + merge-config) — chạy
  // TRƯỚC children render nên chrome helpers đọc đúng config cả SSR lẫn browser.
  setChromeSite({ sfUrl: '', shellUrl: '' });
  void initI18n({ lang: locale }).then((i18n) => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  });
  return (
    <SessionBootProvider>
      <SiteHeader
        className="site-header"
        slots={{ left: [SlotLogo], center: [SlotSearch], right: [SlotActions] }}
        row2={<SlotMiniNav />}
      />
      {children}
      <div className="site-footer site-footer--chrome">
        <Footer />
        {/* Newsletter (SF-13 island) — chrome footer grid track 3 rỗng chủ đích
            (chrome.css comment); đặt dưới 2 cột link trong cùng band #212121.
            Delta layout: newsletter chuyển từ cột 3 xuống full-width row —
            direction FI-390 không định nghĩa footer → chấp nhận, so screenshot. */}
        <div className="container site-footer__newsletter">
          <NewsletterForm locale={locale} />
        </div>
      </div>
    </SessionBootProvider>
  );
}
```

- [ ] **Step 1.4 — `[locale]/layout.tsx` swap.** Thay toàn bộ phần body render (giữ `generateMetadata` + DESCRIPTION nguyên):

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { initI18n } from '@ecommerce/i18n';
import { setChromeSite } from '@ecommerce/chrome';

import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/tokens.css';

import ChromeShell from '../../components/ChromeShell';
import LiveChat from '../../components/LiveChat';
import PwaRegister from '../../components/PwaRegister';
import { ToastProvider } from '../../components/ui-kit';
import { resolveLocale } from '../../lib/format';
import { buildAlternates } from '../../lib/seo';
import { siteUrl } from '../../lib/site';

const DESCRIPTION: Record<string, string> = {
  vi: 'Chợ sôi động — hàng nghìn sản phẩm chính hãng, giá tốt mỗi ngày.',
  en: 'Shop VN — thousands of official products at great prices, every day.',
};

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale = resolveLocale(params.locale);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: 'Shop VN — Chợ sôi động', template: '%s | Shop VN' },
    description: DESCRIPTION[locale ?? 'vi'],
    // hreflang vi/en trang chủ — per-page (PLP/PDP) qua helper ở Task 12/13.
    alternates: buildAlternates('/'),
  };
}

/**
 * Locale layout — SF-4 (FI-401): Header/Footer render từ @ecommerce/chrome
 * (SiteHeader props-slots + Footer) qua client gate ChromeShell. Server await
 * initI18n + changeLanguage URL locale (P0-2 — instance memoized first-call-
 * wins; request đầu tiên của mỗi locale vẫn dịch đúng) + setChromeSite
 * same-origin trên chrome instance SERVER (client gate tự gọi trên instance
 * browser — singleton per runtime). ChromeShell bọc client tree trong
 * SessionBootProvider; islands local giữ (SearchBar/LocaleSwitcher/
 * PwaRegister/LiveChat/ToastProvider).
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();
  setChromeSite({ sfUrl: '', shellUrl: '' });
  const i18n = await initI18n({ lang: locale });
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
  return (
    <ChromeShell locale={locale}>
      {/* ToastProvider (client boundary qua shim) cho mọi page-level consumer
          useToast (hiện tại: CopyButton coupons — T10). Region toast render
          cuối layout — không chiếm layout flow. */}
      <ToastProvider>
        <main>{children}</main>
      </ToastProvider>
      <PwaRegister />
      <LiveChat />
    </ChromeShell>
  );
}
```

⚠ `Footer`/`Header` imports CŨ xóa khỏi file này (PT2 xóa hẳn file component).

- [ ] **Step 1.5 — root `app/layout.tsx` (P1-2 css order + boot script nguồn chrome).** 2 edit:
  1. Xóa `import { THEME_BOOT_SCRIPT } from '../components/ThemeToggle';` — thay:

```tsx
import { THEME_BOOT_SCRIPT } from '@ecommerce/chrome';
```

  2. Css import order (chrome TRƯỚC app.css — element header mang 2 class, app.css thắng background `--c-surface`):

```tsx
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/chrome/styles.css';
import './app.css';
```

- [ ] **Step 1.6 — Run test.** `cd frontend/apps/storefront-web && pnpm vitest run tests/chrome-layout.test.ts`
Expected: **PASS 4/4** (labels dịch nhờ initI18n sync-data — probe `t()` cùng tick "Trang chủ").

- [ ] **Step 1.7 — Commit.**
```bash
git add frontend/apps/storefront-web/package.json frontend/pnpm-lock.yaml \
  frontend/apps/storefront-web/components/ChromeShell.tsx \
  frontend/apps/storefront-web/app/layout.tsx \
  'frontend/apps/storefront-web/app/[locale]/layout.tsx' \
  frontend/apps/storefront-web/tests/chrome-layout.test.ts
git commit -m "feat(sf4): layout swap chrome — ChromeShell gate + SiteHeader slots + i18n wire (FI-401)"
```
(⚠ lock ở `frontend/pnpm-lock.yaml` — workspace root là `frontend/` — P1-2 plan-critic.)

### Task PT2: Xóa dup storefront + theme canonical + css bridge (bracket 2+3)

**Files:**
- Delete: `components/Header.tsx`, `components/Footer.tsx`, `components/ThemeToggle.tsx`, `lib/theme.ts`
- Modify: `app/app.css` (bridge nhỏ, tokens-only)
- Modify: `tests/theme.test.ts` (re-point chrome)

- [ ] **Step 2.1 — Verify import còn lại trước xóa:**
```bash
grep -rn "components/Header\|components/Footer\|components/ThemeToggle\|lib/theme" frontend/apps/storefront-web --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"
```
Expected: ĐÚNG 2 hit (P2-1 plan-critic): `components/ThemeToggle.tsx:8` (tự import lib/theme — sẽ bị xóa cùng lô) + `tests/theme.test.ts` (re-point ở Step 2.2). Layout đã swap ở PT1.

- [ ] **Step 2.2 — theme.test.ts re-point chrome** (contract giữ — chrome theme.ts là port EXACT):

```ts
import { describe, expect, it } from 'vitest';

import { resolveTheme, storedThemeValue } from '@ecommerce/chrome';

describe('resolveTheme (SF-15 dark mode — canonical chrome SF-4)', () => {
  it('localStorage thắng prefers-color-scheme', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('storefront');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('không có lựa chọn → theo prefers-color-scheme (lần đầu)', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('storefront');
    expect(resolveTheme('', true)).toBe('dark');
    expect(resolveTheme('rác', false)).toBe('storefront');
  });

  it('storedThemeValue: chỉ ghi khi user đi NGƯỢC system (null = theo system)', () => {
    expect(storedThemeValue('dark', false)).toBe('dark');
    expect(storedThemeValue('dark', true)).toBeNull();
    expect(storedThemeValue('storefront', true)).toBe('light');
    expect(storedThemeValue('storefront', false)).toBeNull();
  });
});
```

- [ ] **Step 2.3 — Css bridge vào `app/app.css`** (chèn NGAY SAU block `.header-main`, giữ tokens-only):

```css
/* ── SF-4 (FI-401): chrome SiteHeader scaffolding ⇒ storefront geometry ──
   Header element mang .chrome-header + .site-header — app.css import SAU
   chrome.css nên values .site-header thắng (bg --c-surface). Bridge chỉ
   xử lý geometry row1/slot mà chrome.css không biết (container 1280,
   y-padding, responsive wrap của storefront). */
.site-header .chrome-header__row1 {
  max-width: 1280px; /* .container storefront (chrome default 1240) */
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}

@media (max-width: 900px) {
  /* Search xuống dòng riêng — slot center (chứa .search-wrap) nhận vai trò
     .header-main wrap cũ. */
  .site-header .chrome-header__row1 {
    flex-wrap: wrap;
  }

  .site-header .chrome-header__row1 [data-slot='center'] {
    order: 3;
    flex-basis: 100%;
  }
}

@media (max-width: 600px) {
  /* ≤600px .header-main gap co còn space-3 (app.css:2765-2767) — class cũ mất
     theo DOM, bridge sang row1 (P1-3 plan-critic — không bridge = header 375px
     giữ gap 24px, chật). */
  .site-header .chrome-header__row1 {
    gap: var(--space-3);
  }
}

/* ── SF-4: footer band — chrome Footer (nguồn) + newsletter island ────────
   Wrapper .site-footer--chrome neutralize double margin/padding với
   .chrome-site-footer (cùng bg #212121) — newsletter nằm trong band. */
.site-footer--chrome {
  margin-top: var(--space-7);
  padding: 0;
}

.site-footer--chrome .chrome-site-footer {
  margin-top: 0;
}

.site-footer--chrome .site-footer__newsletter {
  padding-top: var(--space-4);
  padding-bottom: var(--space-6);
}
```

- [ ] **Step 2.4 — Xóa 4 file:**
```bash
git rm frontend/apps/storefront-web/components/Header.tsx \
  frontend/apps/storefront-web/components/Footer.tsx \
  frontend/apps/storefront-web/components/ThemeToggle.tsx \
  frontend/apps/storefront-web/lib/theme.ts
```

- [ ] **Step 2.5 — Run toàn bộ storefront suite:**
```bash
cd frontend/apps/storefront-web && pnpm vitest run
```
Expected: xanh (theme.test re-point + chrome-layout mới + các test cũ không đụng markup header/footer). ⚠ Nếu `host-redirect.test.ts` hoặc test khác đọc markup → fix theo đúng assert gốc (không bỏ test).

- [ ] **Step 2.6 — Typecheck:**
```bash
cd frontend/apps/storefront-web && pnpm lint
```
Expected: 0 lỗi (không còn import file đã xóa).

- [ ] **Step 2.7 — Commit.**
```bash
git add -A frontend/apps/storefront-web
git commit -m "feat(sf4): xóa dup Header/Footer/ThemeToggle + theme canonical chrome + css bridge (FI-401)"
```
(⚠ `git add -A` scoped đúng 1 app dir — không sweep root.)

### Task PT3: MFE bootstrap đăng ký trực tiếp từ chrome — xóa wrapper (bracket 5)

**Files:**
- Modify: `frontend/apps/mfe-checkout/src/bootstrap.tsx`
- Delete: `frontend/apps/mfe-checkout/src/CartBadge.tsx`
- Modify: `frontend/apps/mfe-account/src/bootstrap.tsx`
- Delete: `frontend/apps/mfe-account/src/AuthWidget.tsx`
- Modify: `frontend/apps/mfe-account/src/page.css` (dọn `.um-*` dup)
- Modify: `frontend/apps/mfe-account/src/__tests__/userMenu.test.tsx` (re-point — P0-3)

- [ ] **Step 3.1 — mfe-checkout `bootstrap.tsx`.** Thay import wrapper + thêm binding inline (imports css FI-368/SF-1 GIỮ NGUYÊN; `ShellContext`/`appNavigate`/`watchMergeOnLogin` GIỮ):

```tsx
import { useState } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { CartBadge as ChromeCartBadge } from '@ecommerce/chrome';
import { fetchCart } from './lib/cartApi';
import MiniCartDrawer from './MiniCartDrawer';
```

(Xóa dòng `import CartBadge from './CartBadge';`) — thêm component binding TRƯỚC `initCheckoutShell`:

```tsx
/**
 * Đăng ký TRỰC TIẾP component chrome (SF-4 FI-401 — exit criteria P1):
 * wrapper file ./CartBadge.tsx ĐÃ XÓA. Binding checkout-owned inline tại
 * bootstrap (SF-1 design: checkout giữ data-access fetchCart + UI phụ
 * MiniCartDrawer — chrome không copy GET/drawer). Registration id/slot GIỮ.
 */
function CheckoutCartBadge(): ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <ChromeCartBadge fetchCart={fetchCart} onOpen={() => setDrawerOpen(true)} />
      {drawerOpen ? <MiniCartDrawer open onClose={() => setDrawerOpen(false)} /> : null}
    </>
  );
}
```

Trong `initCheckoutShell` thay register (function component assign trực tiếp — không cần cast, P2-2 plan-critic):
```tsx
  ctx.HeaderSlots.register('right', 'checkout-cart-badge', CheckoutCartBadge);
```

- [ ] **Step 3.2 — Xóa `mfe-checkout/src/CartBadge.tsx`** (`git rm frontend/apps/mfe-checkout/src/CartBadge.tsx`).

- [ ] **Step 3.3 — mfe-account `bootstrap.tsx`.** Thay `import AuthWidget from './AuthWidget';`:

```tsx
import { AuthMenu } from '@ecommerce/chrome';
```
và mở rộng type import đầu file (P2-2 plan-critic — file hiện chỉ import `ComponentType`):
```tsx
import type { ComponentType, ReactElement } from 'react';
```

Thêm binding TRƯỚC `initAccountShell` (function declaration — `appNavigate` hoisted, an toàn):

```tsx
/**
 * Đăng ký TRỰC TIẾP chrome AuthMenu (SF-4 FI-401 — exit criteria P1): wrapper
 * file ./AuthWidget.tsx ĐÃ XÓA (.um-* css về chrome.css sở hữu — page.css dọn
 * dup). onNavigate=appNavigate GIỮ SPA-nav shell (logout → /login qua router).
 */
function AccountAuthWidget(): ReactElement {
  return <AuthMenu onNavigate={appNavigate} />;
}
```

Trong `initAccountShell` thay register:
```tsx
  ctx.HeaderSlots.register('right', 'account-auth', AccountAuthWidget);
```

- [ ] **Step 3.4 — Xóa `mfe-account/src/AuthWidget.tsx`; dọn `.um-*` trong `mfe-account/src/page.css`:**
```bash
git rm frontend/apps/mfe-account/src/AuthWidget.tsx
grep -n "^\.um-" frontend/apps/mfe-account/src/page.css
```
Xóa TOÀN BỘ rule-block `.um-*` + `@keyframes um-menu-in` (P2-3 plan-critic — grep `^\.um-` không bắt keyframes; search thêm `um-` trong file cho chắc) — chrome.css sở hữu bản port (AuthMenu.tsx:29-30 chỉ dẫn). ⚠ GIỮ mọi rule KHÔNG phải `.um-*`/`um-menu-in` trong file.

- [ ] **Step 3.5 — userMenu.test.tsx re-point (P0-3).** Mở file — thay:
```tsx
import AuthWidget from '../AuthWidget';
```
thành:
```tsx
import { AuthMenu } from '@ecommerce/chrome';
```
và thay toàn bộ usage `<AuthWidget …>` (7 chỗ) bằng **`<AuthMenu onNavigate={appNavigate} />`** — P0-2 plan-critic: test 7 assert `expect(appNavigate).toHaveBeenCalledWith('/login')` (userMenu.test.tsx:145) — bare `<AuthMenu />` rơi vào nhánh `window.location.assign` (AuthMenu.tsx:90) → fail. `appNavigate` đã được test import sẵn từ '../bootstrap' (mock theo cách hiện có — giữ nguyên); binding GIỮ ĐÚNG spec §2.5. Mock `@ecommerce/auth` hiện có áp dụng cho AuthMenu (import cùng module logout/useAuth). Chạy:
```bash
cd frontend/apps/mfe-account && pnpm vitest run
```
Expected: xanh 7/7.

- [ ] **Step 3.6 — Typecheck 2 MFE + shell (không import vỡ):**
```bash
cd frontend/apps/mfe-checkout && pnpm lint && cd ../mfe-account && pnpm lint
```
Expected: 0 lỗi.

- [ ] **Step 3.7 — Grep evidence (exit criteria P1 — pattern import-only, spec §2.5 "trừ comment giải thích" — P1-1 plan-critic):**
```bash
grep -rnE "import .*from .*\./(CartBadge|AuthWidget)" frontend/apps/mfe-checkout/src frontend/apps/mfe-account/src
```
Expected: **0 dòng** (import wrapper = 0; comment/docstring không tính). Lưu output (kể cả exit code) vào `docs/superpowers/evidence/sf-4/grep-zero-wrappers.txt`.

- [ ] **Step 3.8 — Commit.**
```bash
git add frontend/apps/mfe-checkout/src frontend/apps/mfe-account/src docs/superpowers/evidence/sf-4/grep-zero-wrappers.txt
git commit -m "feat(sf4): bootstrap MFE đăng ký trực tiếp từ chrome — xóa wrapper CartBadge/AuthWidget (FI-401)"
```

### Task PT4: Xóa NEXT_PUBLIC_SHELL_URL code-path chết (bracket 10)

**Files:**
- Modify: `frontend/apps/storefront-web/lib/site.ts`
- Modify: `frontend/apps/storefront-web/tests/site.test.ts`

- [ ] **Step 4.1 — `lib/site.ts`:** thay hàm `shellUrl()` + doc (GIỮ `siteUrl()` nguyên):

```ts
/**
 * Origin shell — SF-4 (FI-401): same-origin TUYỆT ĐỐI qua entry :3000
 * (SF-3). Kill-switch NEXT_PUBLIC_SHELL_URL ĐÃ XÓA (pack item 10 — code path
 * chết sau 1-origin; docker-compose env :502 prod GIỮ nguyên, code không đọc
 * nữa). Link `${shellUrl()}/cart` = `/cart` relative — KHÔNG bao giờ
 * protocol-relative `//cart` (site.test.ts guard).
 */
export function shellUrl(): string {
  return '';
}
```

- [ ] **Step 4.2 — `tests/site.test.ts`:** xóa case kill-switch + scaffolding ENV_KEY — file mới:

```ts
import { describe, expect, it } from 'vitest';

import { shellUrl, siteUrl } from '../lib/site';

describe('shellUrl (SF-4 — same-origin tuyệt đối, kill-switch đã xóa)', () => {
  it('luôn rỗng → link relative qua entry :3000', () => {
    expect(shellUrl()).toBe('');
  });

  it('link shellUrl()+"/cart" KHÔNG sinh protocol-relative "//cart"', () => {
    const cartHref = `${shellUrl()}/cart`;
    expect(cartHref).toBe('/cart');
    expect(cartHref.startsWith('//')).toBe(false);
  });

  it('siteUrl() không đổi — vẫn absolute default :3000', () => {
    delete process.env.SITE_URL;
    expect(siteUrl()).toBe('http://localhost:3000');
  });
});
```

- [ ] **Step 4.3 — Grep residue + run:**
```bash
grep -rn "NEXT_PUBLIC_SHELL_URL" frontend --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
cd frontend/apps/storefront-web && pnpm vitest run tests/site.test.ts
```
Expected: grep 0 hit trong code (docker-compose + .env.example GIỮ — không phải code); test 3/3 PASS.

- [ ] **Step 4.4 — Commit.**
```bash
git add frontend/apps/storefront-web/lib/site.ts frontend/apps/storefront-web/tests/site.test.ts
git commit -m "chore(sf4): xóa NEXT_PUBLIC_SHELL_URL kill-switch chết — same-origin tuyệt đối (FI-401)"
```

### Task PT5: Unit sweep xanh toàn workspace (bracket 7)

**Files:** sửa test vỡ (nếu còn) — không thêm test mới (chrome-layout đã có ở PT1).

- [ ] **Step 5.1 — Storefront full suite:** `cd frontend/apps/storefront-web && pnpm vitest run` — Expected xanh toàn bộ.
- [ ] **Step 5.2 — Chrome package (phải vẫn xanh — KHÔNG đụng):** `cd frontend/packages/chrome && pnpm vitest run` — Expected xanh.
- [ ] **Step 5.3 — mfe-account + mfe-checkout + i18n + auth:** `pnpm vitest run` từng package — Expected xanh (userMenu re-point từ PT3).
- [ ] **Step 5.4 — Typecheck các app đụng:** storefront-web + mfe-checkout + mfe-account `pnpm lint` — Expected 0 lỗi. Shell KHÔNG đổi file nào → verify `git diff --name-only` không có apps/shell.
- [ ] **Step 5.5 — Evidence:** lưu tóm tắt kết quả (số test/file) vào `docs/superpowers/evidence/sf-4/unit-sweep.txt`.
- [ ] **Step 5.6 — Commit (nếu có fix):**
```bash
git add -A frontend/apps frontend/packages
git commit -m "test(sf4): unit sweep xanh sau swap — storefront/chrome/mfe (FI-401)"
```

### Task PT6: e2e subset — golden-path + nav-honesty XANH trên rig 1-origin (bracket 8)

**Files:** không sửa code (chỉ chạy); nếu locator footer vỡ → sửa `frontend/e2e/tests/nav-honesty.spec.ts` (TỐI THIỂU, có comment).

**Rig (backend + shell + remotes + entry — TẤT CẢ FE từ worktree NÀY, port offset; chỉ infra+JVM backend share main checkout — backend read-only, contract đồng nhất):**
- Next entry `:3100` · shell `:5273` (worktree này — P0-1 plan-critic: main's shell :5173 load i18n/chrome từ worktree CỦA NÓ → label-demo PT7.4 không thể "đổi cả 2 app" nếu dùng shell main; provenance remotes cũng chỉ chắc chắn với shell của worktree này) · remotes checkout/account `:5185/:5186` (code PT3).

- [ ] **Step 6.1 — Sửa local `.env` (untracked, KHÔNG commit):** comment out `NEXT_PUBLIC_SHELL_URL` + đổi `REMOTE_CHECKOUT_URL`/`REMOTE_ACCOUNT_URL` thành relative `/remotes/checkout` // `/remotes/account` (1-origin mode — next.config đọc env khớp `^https?://` mới dùng absolute).

- [ ] **Step 6.2 — Boot 2 remotes của worktree:**
```bash
cd frontend/apps/mfe-checkout && DEV_PORT=5185 nohup pnpm dev > /tmp/sf4-checkout.log 2>&1 &
cd frontend/apps/mfe-account  && DEV_PORT=5186 nohup pnpm dev > /tmp/sf4-account.log 2>&1 &
```
Expected: vite lên (log `Local: http://localhost:5185/remotes/checkout/`).

- [ ] **Step 6.2b — Boot shell của worktree (P0-1 plan-critic):**
```bash
cd frontend/apps/shell && DEV_PORT=5273 nohup pnpm dev > /tmp/sf4-shell.log 2>&1 &
```
Expected: vite `:5273`. (Shell code KHÔNG đổi trong SF-4 — nhưng phải chạy từ worktree này để i18n/chrome package + remote provenance là CỦA worktree: shell resolve remoteEntry relative `/remotes/<name>` theo page origin :3100 → rewrites → :5185/:5186 của mình.)

- [ ] **Step 6.3 — Boot Next entry worktree:** (⚠ dev script hardcode `-p 3000` — dùng `pnpm exec next dev -p 3100`; inline env WIN trên .env file — rewrites đọc SHELL_ORIGIN/REMOTE_*_URL lúc boot)
```bash
cd frontend/apps/storefront-web && \
  SHELL_ORIGIN=http://localhost:5273 \
  REMOTE_CHECKOUT_URL=http://localhost:5185 REMOTE_ACCOUNT_URL=http://localhost:5186 \
  GATEWAY_URL=http://localhost:8080 \
  nohup pnpm exec next dev -p 3100 > /tmp/sf4-next.log 2>&1 &
```
Mục tiêu: entry Listen `:3100`, rewrites /cart → :5273 (shell mình), /remotes/checkout → :5185, /remotes/account → :5186 (verify trong log + curl).

- [ ] **Step 6.4 — Smoke bằng browser (Rule 0 — T1 DOM):** mở `http://localhost:3100/vi` — header chrome render (`chrome-header` trong DOM), /cart proxy về shell :5173 KHÔNG 404 (stack main checkout entry cũ bị 404 — rig mình phải đúng), /remotes/checkout/remoteEntry.js 200.

- [ ] **Step 6.5 — Run 2 specs (sequential — recipe SF-1 QA):**
```bash
cd frontend/e2e && E2E_STOREFRONT_URL=http://localhost:3100 E2E_SHELL_URL=http://localhost:3100 \
  pnpm playwright test tests/nav-honesty.spec.ts
cd frontend/e2e && E2E_STOREFRONT_URL=http://localhost:3100 E2E_SHELL_URL=http://localhost:3100 \
  pnpm playwright test tests/golden-path.spec.ts
```
Expected: XANH. ⚠ golden-path test 0 HARD-ASSERT Stripe keys trong root .env (golden-path.spec.ts:86-92 — thiếu = FAIL THẬT, KHÔNG skip; P2-4 plan-critic sửa nhận định sai). Root .env đã copy từ main checkout (đang chạy stripe e2e) — kỳ vọng đủ; nếu vẫn fail vì keys → report BLOCKED với evidence, KHÔNG sửa spec/skip test trong SF-4. Backend identity/cart từ main stack :8080.
⚠ Nếu footer locator `.site-footer a` fail vì chrome markup — wrapper alias `site-footer--chrome` đã giữ class `site-footer` → locator vẫn match; chỉ sửa spec khi còn vỡ, đổi thành `.site-footer a, .chrome-site-footer a` + comment `SF-4 chrome footer`.

- [ ] **Step 6.6 — Evidence + commit (nếu sửa spec):**
```bash
git add frontend/e2e/tests/nav-honesty.spec.ts   # chỉ nếu có sửa
git commit -m "test(sf4): e2e nav-honesty selector chrome footer (FI-401)"   # chỉ nếu có sửa
```

### Task PT7: GA/livechat evidence + walkthrough cross-app (bracket 4+9 — COORDINATOR, Rule 0)

Không có code change (GA/livechat giữ storefront-owned — spec §2.4). Coordinator TỰ mở browser đi flow, KHÔNG giao agent.

- [ ] **Step 7.1 — BEFORE/AFTER screenshots home + PLP :3100 (đã có BEFORE `docs/superpowers/evidence/sf-4/before-*.png`) — so visual: header 2 hàng/logo/search/actions/mini-nav/footer band "giống hệt FI-390"; ghi gap-list (newsletter reflow = delta accepted §ChromeShell).**
- [ ] **Step 7.2 — Cross-app flow:** storefront → click Giỏ hàng → `/cart` (shell) → Tài khoản → `/account` → back storefront; screenshot từng bước.
- [ ] **Step 7.3 — Theme sync:** toggle ở storefront → screenshot; sang `/cart` cùng theme; toggle ở shell → quay lại storefront cùng theme (key `ecommerce.theme` chung).
- [ ] **Step 7.4 — Label demo:** sửa tạm 1 nhãn `chrome.*` (vd `chrome.footer.linkCart` vi trong `packages/i18n/src/catalogs/vi.ts` — CHỈ local, KHÔNG save vào git) → reload cả :3100 storefront + shell qua :3100/cart → CẢ HAI hiện nhãn mới → `git checkout -- packages/i18n/src/catalogs/vi.ts` revert + screenshot evidence.
- [ ] **Step 7.5 — GA/livechat network evidence:** devtools network trên :3100/vi — pageview gtag bắn khi navigate (NEXT_PUBLIC_GA_ID set), script tawk chỉ khi NEXT_PUBLIC_LIVECHAT_LICENSE_ID set (env trống → evidence "không load gì, không lỗi console").
- [ ] **Step 7.6 — /admin smoke:** `:3100/admin` vào được, layout riêng full-bleed (không chrome wrap) — screenshot.
- [ ] **Step 7.7 — not-found:** `/vi/route-khong-ton-tai` render CÓ chrome; root not-found (như /cart khi shell chết) KHÔNG chrome — screenshot cặp, ghi expected.
- [ ] **Step 7.8 — Dark + en + 375px spot-check:** dark mode header/footer; `/en` chrome labels tiếng Anh (changeLanguage path — cần request ĐỘC LẬP fresh load); mobile 375 header wrap (bridge media query).

---

## Verification matrix (ACCEPTANCE pack → task)

| ACCEPTANCE (pack) | Task chứng minh |
|---|---|
| 1. Header/Footer render từ chrome, giống FI-390; markup cũ KHÔNG còn (grep) | PT2 (xóa + grep 2.1) + PT7.1 BEFORE/AFTER |
| 2. Sửa 1 nhãn `chrome.*` → cả 2 app đổi | PT7.4 (label demo 2 app) |
| 3. Theme 1 nguồn; GA/livechat bắn đúng; cart-badge + account menu 2 app | PT7.3 + PT7.5 + PT3 (registration direct — demo qua shell) |
| 4. Cross-app nav mượt; locale giữ path; nav-honesty + golden-path XANH | PT7.2 + PT6 |
| 5. Unit tests storefront + shell xanh | PT5 (shell: 0 unit test tồn tại — probe; chrome+storefront xanh) |

## Risks khi execute

| Rủi ro | Xử lý |
|---|---|
| pnpm-lock diff lan rộng | Chỉ importer storefront-web được phép; khác → dừng, review |
| `.env` stale (NEXT_PUBLIC_SHELL_URL + REMOTE_* absolute) | PT6.1 sửa local .env (untracked) trước boot |
| Port war với stack main checkout (:3000/:5173 sống) | Rig offset :3100/:5185/:5186 — KHÔNG kill stack main |
| chrome layout SSR khác browser (singleton i18n) | Accepted limitation đã ghi; client changeLanguage tự sửa |
| vitest include không chạy test mới | Test là `.test.ts` (P0-4) — nếu thêm .tsx phải đổi vitest.config (READ-ONLY) |
| Shared worktree commit race | Chạy TUẦN TỰ PT1→PT7, không 2 executor cùng lúc |
