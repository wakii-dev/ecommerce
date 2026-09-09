# T1 — Cross-surface consistency sweep (FI-396 / SF-6)

> QA độc lập — READ-ONLY app/packages. Sweep chạy trên worktree `sf-6-convergence-qa`
> (branch `wakii-dev/sf-6-convergence-qa` = tip merge 5 SF). Ngày: 2026-09-09.
> Phạm vi: `frontend/apps/**` + `frontend/packages/**` (skip node_modules/.next/dist).

## Per-check verdict table

| # | Check | Verdict | Tóm tắt |
|---|-------|---------|---------|
| 1 | `@keyframes` chỉ ở 5 file được phép | **PASS** | 11 hits nằm đúng app.css (2) + mfe-account/page.css (1) + ui-kit.css (8). 0 hit ngoài danh sách. |
| 2 | `<a href="/` raw anchor trong storefront-web | **PASS** | 0 hit trong source (.ts/.tsx/.js/.jsx, skip .next). |
| 3 | Emoji-as-icon: 5 component định danh | **FAIL (1/5)** | WishlistPage ★:138 render thật (SF-4). CartBadge, ThemeToggle ×2, UserMenu, ConfirmationPage hero: PASS. |
| 3b | Emoji broad-scan 5 surfaces | **INFO** | Tổng 44 dòng có pictograph; 33 render cho user — phần lớn là direction-sanctioned (§2.2.3/§2.2.5/§4); 8 vị trí glyph KHÔNG sanction → fail-list. |
| 4 | Raw hex trong CSS app | **FAIL** | app.css: 12 hit hex ngoài var() (#fff/#212121/#bbb/#a0a0a0); mfe-account/page.css: 2 (#FDEBEC/#C0151F). tokens.css exempt (nguồn token). |
| 5 | Inline `<svg` ngoài ui-kit Icon | **PASS (evidence list)** | 14 vị trí, tất cả stroke=currentColor + strokeWidth 1.8 (đúng §6). Không auto-fail; 2 cụm deviation single-source → P2. |
| 6 | Pill/badge/tint tokens | **PASS** | Cả 5 surface dùng var(--pill-/--tint-/--wash-*); 0 định nghĩa hex pill/tint/wash cục bộ trong surface CSS. |

**T1 — VERDICT: FAIL** (check 3 + 4 fail → fix-taskproposal bên dưới; còn lại PASS).

## Evidence (lệnh + số liệu)

Cách grep: `find <dirs> \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -not -path '*node_modules*' -not -path '*.next*' -print0 | xargs -0 grep …` (tránh BSD grep multi `--include` false-negative). Scan Unicode dùng `perl -CSD` (phải decode UTF-8 — grep byte thuần miss ký tự multi-byte).

### Check 1 — @keyframes
```
find frontend/apps frontend/packages -name '*.css' … | xargs grep -n '@keyframes'
→ 11 hits: storefront-web/app/app.css:553,1805 · mfe-account/src/page.css:607
   · packages/ui-kit/src/styles/ui-kit.css:119,271,302,380,394,400,553,716
mở rộng .ts/.tsx/.js: 0 hit thêm.
```
Tất cả nằm trong danh sách được phép (app.css + page.css×3 + ui-kit.css). mfe-checkout/mfe-admin/shell: 0 keyframes tự chế — motion của chúng đi qua primitive ui-kit (`uk-drawer-in`, `uk-toast-in`, `uk-pop-in`…) = đúng direction §5.6. PASS.

### Check 2 — raw internal anchor
```
find frontend/apps/storefront-web … \( -name '*.tsx' -o -name '*.ts' \) … | xargs grep -n '<a href="/'
→ exit 1 (0 hit)
```
PASS. (Ghi chú: mfe-account WishlistPage.tsx:123 có `<a href={\`/p/…\`}>` — ngoài phạm vi check 2 vốn chỉ storefront-web; đã dùng next/link ở storefront.)

### Check 3 — emoji-as-icon
Cách tránh false-positive ThemeToggle "✓" (:18 storefront, :11 shell): scan Unicode bằng perl range `\x{1F300}-\x{1FAFF} \x{2600}-\x{26FF} \x{2700}-\x{27BF} \x{2B00}-\x{2BFF} \x{FE0F}` trên toàn source, sau đó ĐỌC context từng hit để phân loại comment vs JSX literal (không dùng naive file-grep).
- CartBadge.tsx:20 — "🛒" nằm trong COMMENT ("FI-393 T3: emoji 🛒 → Icon cart") → không render. Component dùng `<Icon name="cart" size={22}/>` (:71). PASS.
- shell/ThemeToggle.tsx:11 — "☀️/🌙" trong COMMENT; render `<Icon name={dark ? 'sun' : 'moon'}>` (:62). PASS.
- storefront/ThemeToggle.tsx:18 — "✓" trong COMMENT (false-positive đã biết, xác nhận). PASS.
- UserMenu = mfe-account AuthWidget.tsx — 0 hit Unicode; dùng `<Icon name="chevron-down">` (:169). PASS.
- ConfirmationPage hero — 0 emoji; `<Icon name="package" size={40}/>` (:111), `Icon alert/check` (:139). PASS.
- **WishlistPage.tsx:138 — FAIL**: `<span className="wl-card-stars" aria-hidden="true">★</span>` — glyph sao render thị giác cho user (aria-hidden chỉ ẩn với AT), vi phạm epic §7.6 "emoji làm icon = 0 … thay bằng SVG Icon".

Broad-scan còn lại (đầy đủ tại phần fail-list + P2): EmptyState `icon="…"` render qua `uk-empty__icon` (ui-kit EmptyState.tsx:26) — 12 vị trí admin + 5 vị trí storefront; CategoryTiles emoji map (:22-36, render `cat-icon`); PDP Gallery placeholder `categoryEmoji` (catalog-api.ts:116-130 → Gallery.tsx) — nhóm này direction-sanctioned (§2.2.3 "emoji 30px", §2.2.5 "emoji 52px", §4 "empty state: emoji 48px muted", §6 gradient/emoji là fallback bắt buộc).

### Check 4 — raw hex
```
find … -name '*.css' … | xargs grep -nE '#[0-9a-fA-F]{3,8}\b'   → ~300+ dòng (phần lớn var() fallback)
perl strip var(…) → chỉ giữ hex NGOÀI var():
  tokens.css: toàn bộ định nghĩa token (nguồn sự thật — exempt, §1.3 khớp 100%)
  app.css: 12 hit code (#fff/#ffffff ×8, #212121 ×2, --footer-link #bbb, --footer-link dark #a0a0a0)
  mfe-account/page.css: 42 #FDEBEC, 43 #C0151F
  shell/base.css + header.css, mfe-checkout/page.css, mfe-admin/page.css: 0 hit ngoài var()
  (các dòng còn lại là COMMENT — không phải code)
```
FAIL — chi tiết tại fail-list. Ghi nhận: nhiều literal có comment trích dẫn lý do contrast (AA) hoặc "direction §2.2.5" — cần chuẩn hoá về token chứ không phải xoá màu.

### Check 5 — inline `<svg`
```
find frontend/apps … | xargs grep -n '<svg' → 14 vị trí
```
| Vị trí | Loại | Đánh giá §6 |
|---|---|---|
| storefront Header.tsx:36,45 | icon header, stroke 1.8 currentColor | đúng prototype; P2: nên chuyển ui-kit Icon khi có icon tương ứng |
| storefront SearchBar.tsx:164 | icon search 1.8 | như trên |
| storefront ThemeToggle.tsx:56 | sun/moon 1.8 | P2: shell ThemeToggle đã dùng ui-kit Icon → LỆCH 2 implementation cùng component |
| storefront FlashDealSection.tsx:39 | icon sét 1.8 | conform |
| storefront HeroCarousel.tsx:117,121 | play/pause 12px | conform (size ngoài 18-22 vì control nhỏ — chấp nhận) |
| storefront ReviewBadge.tsx:11 | badge 12px | conform |
| storefront p/[slug]/page.tsx:242 | svg PDP buy-area 1.8 | conform |
| mfe-account EyeIcon.tsx:10 | icon mắt 1.8 | conform; local icon vì ui-kit chưa có eye |
| mfe-admin AdminIcon.tsx:90 | bộ icon admin 1.8 | conform; local set — P2 single-source |
| MiniCartDrawer:23, CartPage:25, CheckoutPage:41 | data-URI SVG placeholder ô trống | không phải icon — OK |

Không vị trí nào vi phạm stroke 1.8. Evidence-list PASS (2 cụm P2 single-source).

### Check 6 — pill/tint/wash
```
đếm var(--pill-/--tint-/--wash-*) per file:
  app.css            pill=3  tint=36 wash=7  | hex pill/tint/wash cục bộ = 0
  shell/base.css     0/0/0                   | 0
  shell/header.css   0/1/1                   | 0
  mfe-checkout       3/15/4                  | 0
  mfe-account        17/6/3                  | 0
  mfe-admin          6/14/5                  | 0
  ui-kit.css         6/12/7                  | 0
```
PASS — mọi surface tham chiếu token dùng chung, không surface nào tự chế màu pill/tint/wash.

## Fail-list → fix-task proposal

| # | Surface | File | Hành vi sai | SF sở hữu | Fix-task đề xuất |
|---|---------|------|-------------|-----------|------------------|
| F1 | account | `frontend/apps/mfe-account/src/pages/wishlist/WishlistPage.tsx:138` | Glyph `★` render làm icon rating trong card wishlist (epic §7.6 yêu cầu 0 và thay bằng SVG Icon) | **SF-4** | Thay `★` bằng `<Icon name="star" size={12}/>` (hoặc star-track CSS như product-card §2.2.5) |
| F2 | storefront | `frontend/apps/storefront-web/app/app.css` (:1000,1503,1596,1772,233,2720,345,398,455,530,633,782) | 10 literal `#fff/#ffffff`, 2 literal `#212121` ngoài var() — vi phạm direction §5.2 (dù có comment lý do AA/đích danh) | **SF-2** | Promote thành token (`--c-on-primary`, `--footer-bg`, `--countdown-bg`…) trong tokens.css rồi tham chiếu var() |
| F3 | storefront | `frontend/apps/storefront-web/app/app.css:21,23,2746-2749` | `--footer-link:#bbb`, `--footer-bg:#212121`, dark override `#a0a0a0`, `--hot-tag-text:#212121/#ffffff` — hex NẤM NGOÀI family được phép (§5.1: chỉ `#0F0F0F` + gradient family) | **SF-2** | Đưa footer/hot-tag colors vào tokens.css (light+dark) với value giữ nguyên; #bbb/#a0a0a0 cần duyệt value mới hoặc map sang gray-hễu có |
| F4 | account | `frontend/apps/mfe-account/src/page.css:42-43` | `background:#FDEBEC; color:#C0151F` raw (login/register tint) — value trùng `--pill-cancelled-*` nhưng không qua var() | **SF-4** | Thay bằng `var(--pill-cancelled-bg)`/`var(--pill-cancelled-text)` hoặc tint token riêng |
| F5 | admin | `frontend/apps/mfe-admin/src/pages/ProductFormPage.tsx:460,552` | Glyph `✕` làm icon nút xoá variant/ảnh | **SF-5** | Thay `<Icon name="x"/>` (ui-kit) |
| F6 | storefront | `frontend/apps/storefront-web/components/wishlist/WishlistHeart.tsx:99` | Glyph `♥/♡` làm icon heart toggle (PDP + product card) | **SF-2** | Thay bằng Icon heart (fill toggle) |
| F7 | checkout | `frontend/apps/mfe-checkout/src/pages/CheckoutPage.tsx:652` | Glyph `⚠` render trong pay-warning | **SF-3** | Thay `<Icon name="alert"/>` |
| F8 | storefront | `frontend/apps/storefront-web/lib/i18n.ts:111,119` | `✓` nhúng trong VALUE toast ("Đã thêm vào giỏ ✓") render cho user | **SF-2** | Bỏ ✓ khỏi copy hoặc render Icon check cạnh toast text |
| F9 | storefront+account | reviews ★☆: `WriteReviewModal.tsx:138`, `MyPendingReviewPanel.tsx:101-102`, `ProductReviewsSection.tsx:68,91-92`, `WriteReviewControl.tsx:34` (✎), `mfe-account MyReviewsPage.tsx:96-97` | Glyph ★/☆/✎ làm icon rating/pencil thay SVG (product-card đã có star-track chuẩn §2.2.5) | **SF-2** (storefront) / **SF-4** (MyReviewsPage) | Chuẩn hoá về star-track CSS + Icon |

## P2 notes

- **@keyframes ">0 trong ĐÚNG 4 file" (spec §7.3)**: mfe-checkout/page.css và mfe-admin/page.css hiện 0 keyframes (motion đi primitive ui-kit). Đúng §5.6 direction; nếu đọc spec theo nghĩa "mỗi file phải >0" thì cần coordinator cắt nghĩa — khuyến nghị hiểu theo permission chứ không obligation.
- **app.css định nghĩa lại `--grad-hero-1/2/3`, `--grad-flash`, `--grad-buy` (:15-19)** trùng value tokens.css — drift risk; nên xoá bản local nếu storefront đã import tokens (SF-2).
- **ThemeToggle 2 implementation** (shell = ui-kit Icon, storefront = inline svg) — cross-surface inconsistency nhẹ; gộp về ui-kit Icon.
- **EmptyState emoji** (12 admin + 5 storefront) và **CategoryTiles/PDP emoji placeholder** — render user nhưng direction-sanctioned (§2.2.3, §2.2.5, §4, §6); chỉ thay khi làm "ảnh thật" (out of scope hiện tại).
- **Local icon sets** (EyeIcon, AdminIcon) — conform stroke 1.8; cân nhắc merge về ui-kit để single-source.
- Scanner Unicode lần đầu dùng class ký tự gõ tay bị mangle (match `·` U+00B7) → đã chuyển sang range an toàn U+00C0-024F + U+1EA0-1EFF và verify tay từng hit biên; mọi hit "·"/"×"/"đ" là false-positive (đã loại).

**T1 — FINAL: FAIL** (2/6 check fail: #3 WishlistPage ★, #4 raw hex; 9 fix-task đề xuất: SF-2 ×5, SF-3 ×1, SF-4 ×2, SF-5 ×2 — tính trùng surface).
