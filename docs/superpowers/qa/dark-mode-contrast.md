# Dark-mode 4-state contrast sweep (FI-396 / T2) — Round 0 tooling fix

> **Round 0 tooling fix — kết quả trước đó (148 fail) bao gồm false-fail gradient/node; số trong báo cáo này THAY THẾ.**

> Phương pháp: **scripted** — contrast WCAG 2.x đo từ computed styles per theme trên rig sống (không thuần mắt). Background effective: leo ancestor tới lớp opaque đầu tiên; element nền **gradient** → parse color-stops, dùng stop giữa (`bgSource: gradient`); html transparent → `--c-bg`. Chỉ đo node **thực sự render glyph** (direct text node hoặc descendant sâu nhất — anchor cha màu default-blue không còn bị đo nhầm). Node ẩn (`display:none`, `offsetParent` null) không đo.

- Ngày chạy: 2026-09-09T01:04:17.048Z
- Rig: storefront http://127.0.0.1:3101 · shell http://localhost:5703
- 4 trạng thái theme: `storefront` (light) · `dark` · `admin` (light) · `admin-dark` — flip qua `data-theme` trên `<html>`, đúng cơ chế của apps (4 blocks trong `packages/ui-kit/src/styles/tokens.css`)
- Ngưỡng: text thường ≥ 4.5; large text (≥24px hoặc ≥18.66px bold) ≥ 3.0; UI component badge/pill ≥ 3.0
- Evidence đầy đủ per element: `scripts/qa/contrast-results.json` (602 elements đo được)

## Ghi chú chạy
- PDP slug chọn: sf4-order-1788904546455
- Login: shell /login là OAuth flow (IdP redirect, không phải password-fill thuần) → cart/checkout/account/orders/admin đo ở guest-guard state trên shell :5703, guard screen vẫn render bằng theme tokens thật (admin-dark v.v.)
- Real-bug ngoài 2 item đã biết (theme-toggle dark, plp-brand-input dark): 37 → SF-2/pdp/pdp-chip; SF-2/pdp/pdp-stepper-btn; SF-2/coupons/coupon-copy; SF-3/login/; SF-4/login/; SF-3/login/; SF-1/login/uk-btn__label; SF-3/cart/; SF-3/cart/; SF-1/cart/uk-btn__label; SF-3/checkout/; SF-3/checkout/; SF-3/checkout/; SF-3/confirmation/; SF-3/confirmation/; SF-3/confirmation/; SF-3/confirmation/; SF-3/account/; SF-4/account/; SF-3/account/; SF-1/account/uk-btn__label; SF-3/orders/; SF-4/orders/; SF-3/orders/; SF-1/orders/uk-btn__label; SF-3/order-detail/; SF-4/order-detail/; SF-3/order-detail/; SF-1/order-detail/uk-btn__label; SF-3/admin-products/; SF-5/admin-products/; SF-3/admin-products/; SF-1/admin-products/uk-btn__label; SF-3/admin-orders/; SF-5/admin-orders/; SF-3/admin-orders/; SF-1/admin-orders/uk-btn__label

**Phân loại: 43 real-bug (fix-task) · 152 AA design-exception (brand-lock) · verdict rule: PASS nếu real-bug chỉ gồm 2 item đã biết (theme-toggle dark + plp-brand-input dark) trở xuống VÀ AA-notes đầy đủ**

## Verdict per page × theme

| Page | Theme | SF | Pass | Fail | Ghi chú |
|------|-------|----|------|------|---------|
| home | `storefront` | SF-2 | 35 | **10** | — |
| home | `dark` | SF-2 | 34 | **11** | — |
| plp-cong-nghe | `storefront` | SF-2 | 22 | **5** | — |
| plp-cong-nghe | `dark` | SF-2 | 21 | **6** | — |
| pdp | `storefront` | SF-2 | 23 | **11** | — |
| pdp | `dark` | SF-2 | 27 | **7** | — |
| search | `storefront` | SF-2 | 21 | **4** | — |
| search | `dark` | SF-2 | 20 | **5** | — |
| coupons | `storefront` | SF-2 | 16 | **5** | — |
| coupons | `dark` | SF-2 | 15 | **6** | — |
| login | `storefront` | SF-4 | 9 | **7** | login surface (auth form) — legitimate UI |
| login | `dark` | SF-4 | 10 | **6** | login surface (auth form) — legitimate UI |
| cart | `storefront` | SF-3 | 7 | **6** | — |
| cart | `dark` | SF-3 | 8 | **5** | — |
| checkout | `storefront` | SF-3 | 5 | **6** | step 1; steps 2-3 cần order+login state — bỏ qua theo spec |
| checkout | `dark` | SF-3 | 6 | **5** | step 1; steps 2-3 cần order+login state — bỏ qua theo spec |
| confirmation | `storefront` | SF-3 | 8 | **5** | — |
| confirmation | `dark` | SF-3 | 7 | **6** | — |
| account | `storefront` | SF-4 | 9 | **7** | — |
| account | `dark` | SF-4 | 10 | **6** | — |
| orders | `storefront` | SF-4 | 9 | **7** | — |
| orders | `dark` | SF-4 | 10 | **6** | — |
| order-detail | `storefront` | SF-4 | 9 | **7** | không có order state → đo not-found/guard state nếu render |
| order-detail | `dark` | SF-4 | 10 | **6** | không có order state → đo not-found/guard state nếu render |
| admin-dashboard | `admin` | SF-5 | 9 | **7** | applied=`storefront` |
| admin-dashboard | `admin-dark` | SF-5 | 9 | **7** | applied=`storefront` |
| admin-products | `admin` | SF-5 | 9 | **7** | — |
| admin-products | `admin-dark` | SF-5 | 10 | **6** | — |
| admin-orders | `admin` | SF-5 | 9 | **7** | — |
| admin-orders | `admin-dark` | SF-5 | 10 | **6** | — |

## Bảng 1 — Real-bug fix-tasks (coordinator quyết định — executor KHÔNG sửa app code)

| SF | Element (gộp signature) | Text | Màu chữ | Nền effective | bgSource | Theme | Ratio | Ngưỡng | Xuất hiện trên |
|----|--------------------------|-------|---------|---------------|----------|-------|-------|--------|-----------------|
| SF-3 | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | `dark`/`admin-dark` | **4.44** | 4.5 | login, cart, checkout, confirmation, account, orders, order-detail, admin-products, admin-orders |
| SF-3 | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | `dark`/`admin-dark` | **4.44** | 4.5 | login, cart, checkout, confirmation, account, orders, order-detail, admin-products, admin-orders |
| SF-1 | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | `dark`/`admin-dark` | **4.44** | 4.5 | login, cart, account, orders, order-detail, admin-products, admin-orders |
| SF-3 | button (`header-action-label`) | Tối | `rgb(245, 245, 245)` | `#efefef` | ancestor-blend | `dark` | **1.05** | 4.5 | home, plp-cong-nghe, pdp, search, coupons |
| SF-4 | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | `dark` | **4.44** | 4.5 | login, account, orders, order-detail |
| SF-3 | link (`a`) | /skeleton — nạp remote "sk | `rgb(0, 0, 238)` | `#121212` | ancestor-blend | `dark` | **1.99** | 4.5 | confirmation |
| SF-5 | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | `admin-dark` | **4.44** | 4.5 | admin-products, admin-orders |
| SF-2 | form-input (`plp-brand-input`) | Tên thương hiệu… | `rgb(245, 245, 245)` | `#ffffff` | ancestor-blend | `dark` | **1.09** | 4.5 | plp-cong-nghe |
| SF-2 | button (`pdp-chip`) | M | `rgb(0, 0, 0)` | `#1e1e1e` | ancestor-blend | `dark` | **1.26** | 4.5 | pdp |
| SF-2 | button (`pdp-stepper-btn`) | + | `rgb(0, 0, 0)` | `#1e1e1e` | ancestor-blend | `dark` | **1.26** | 4.5 | pdp |
| SF-2 | button (`coupon-copy`) | Sao chép | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | `dark` | **4.44** | 4.5 | coupons |
| SF-3 | link (`a`) | đăng nhập | `rgb(245, 61, 45)` | `#33270e` | ancestor-blend | `dark` | **3.89** | 4.5 | checkout |

(12 signature khác nhau cho 43 fail — element giống hệt lặp qua nhiều page chỉ cần 1 fix.)

### Fix-task proposals

- [SF-3] dark/admin-dark — link `a` (trên: login, cart, checkout, confirmation, account, orders, order-detail, admin-products, admin-orders): ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-3] dark/admin-dark — button `button` (trên: login, cart, checkout, confirmation, account, orders, order-detail, admin-products, admin-orders): ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] dark/admin-dark — button `uk-btn__label` (trên: login, cart, account, orders, order-detail, admin-products, admin-orders): ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"
- [SF-3] dark — button `header-action-label` (trên: home, plp-cong-nghe, pdp, search, coupons): ratio 1.05 < 4.5 (normal text 1.4.3); color `rgb(245, 245, 245)` trên `#efefef` (ancestor-blend); text "Tối"
- [SF-4] dark — link `a` (trên: login, account, orders, order-detail): ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-3] dark — link `a` (trên: confirmation): ratio 1.99 < 4.5 (normal text 1.4.3); color `rgb(0, 0, 238)` trên `#121212` (ancestor-blend); text "/skeleton — nạp remote "skeleton/Page" q"
- [SF-5] admin-dark — link `a` (trên: admin-products, admin-orders): ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-2] dark — form-input `plp-brand-input` (trên: plp-cong-nghe): ratio 1.09 < 4.5 (normal text 1.4.3); color `rgb(245, 245, 245)` trên `#ffffff` (ancestor-blend); text "Tên thương hiệu…"
- [SF-2] dark — button `pdp-chip` (trên: pdp): ratio 1.26 < 4.5 (normal text 1.4.3); color `rgb(0, 0, 0)` trên `#1e1e1e` (ancestor-blend); text "M"
- [SF-2] dark — button `pdp-stepper-btn` (trên: pdp): ratio 1.26 < 4.5 (normal text 1.4.3); color `rgb(0, 0, 0)` trên `#1e1e1e` (ancestor-blend); text "+"
- [SF-2] dark — button `coupon-copy` (trên: coupons): ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Sao chép"
- [SF-3] dark — link `a` (trên: checkout): ratio 3.89 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#33270e` (ancestor-blend); text "đăng nhập"

## Bảng 2 — AA design-exception notes (brand-lock epic Q1 — KHÔNG phải fix-task, cấm đổi hex)

| Combo | SF | Page | Theme | Element | Ratio | Guideline exception |
|-------|----|------|-------|---------|-------|---------------------|
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | home | `storefront` | body-text `hero-kicker` | **2.59** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | home | `storefront` | body-text `hero-kicker` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | home | `storefront` | heading `hero-title` | **2.59** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | home | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | home | `dark` | body-text `hero-kicker` | **2.59** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | home | `dark` | body-text `hero-kicker` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | home | `dark` | heading `hero-title` | **2.59** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | home | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | plp-cong-nghe | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | plp-cong-nghe | `storefront` | button `plp-brand-btn` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | plp-cong-nghe | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | plp-cong-nghe | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | plp-cong-nghe | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | pdp | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-2 | pdp | `storefront` | link `a` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-2 | pdp | `storefront` | link `a` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | pdp | `storefront` | link `pdp-meta-count` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | pdp | `storefront` | button `pdp-cta pdp-cta--secondary` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | pdp | `storefront` | button `pdp-cta pdp-cta--primary` | **2.59** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-1 | pdp | `storefront` | button `uk-tab uk-tab--active` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-1 | pdp | `storefront` | button `uk-tab` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-1 | pdp | `storefront` | button `uk-tab` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | pdp | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên brand gradient (hero/CTA/flash — --grad-*, direction §2.1; Round-0 đã fix đo gradient — ratio giờ là số thật, brand quyết) | SF-2 | pdp | `dark` | button `pdp-cta pdp-cta--primary` | **2.59** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | search | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | search | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | search | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | search | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | coupons | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | coupons | `storefront` | button `coupon-copy` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | coupons | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | coupons | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | coupons | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | login | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | login | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | login | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | login | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | login | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | login | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | login | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | login | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | login | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | cart | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | cart | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | cart | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | cart | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | cart | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | cart | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | cart | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | cart | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | checkout | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | checkout | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | checkout | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | checkout | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | checkout | `storefront` | link `a` | **3.44** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | checkout | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | checkout | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | checkout | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | confirmation | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | confirmation | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | confirmation | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | confirmation | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | confirmation | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | confirmation | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-3 | confirmation | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | account | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | account | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | account | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | account | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | account | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | orders | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | orders | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | orders | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | orders | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | orders | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | order-detail | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | order-detail | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | order-detail | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | order-detail | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | order-detail | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | admin-dashboard | `admin` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-dashboard | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-dashboard | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-dashboard | `admin` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | admin-dashboard | `admin` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | admin-dashboard | `admin-dark` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-dashboard | `admin-dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-dashboard | `admin-dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-dashboard | `admin-dark` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | admin-dashboard | `admin-dark` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | admin-products | `admin` | link `um-guest__register` | **3.27** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-products | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-products | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-products | `admin` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | admin-products | `admin` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-3 | admin-orders | `admin` | link `um-guest__register` | **3.27** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-orders | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-orders | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-3 | admin-orders | `admin` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | admin-orders | `admin` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |

> Các combo này là lựa chọn brand có chủ ý (direction §2.1) — ghi nhận để audit, KHÔNG tạo fix-task. Nếu sau này brand nới lock, ưu tiên tăng độ đậm/kích thước hoặc đổi nền region thay vì đổi hex token.

## Bảng 3 — Pass summary

- Tổng elements đo được: **602** trên 30 page×theme combo
- Pass: **407** · Fail: **195** (real-bug 43 + AA-note 152)

| Page | Theme | Pass/Total |
|------|-------|------------|
| home | `storefront` | 35/45 |
| home | `dark` | 34/45 |
| plp-cong-nghe | `storefront` | 22/27 |
| plp-cong-nghe | `dark` | 21/27 |
| pdp | `storefront` | 23/34 |
| pdp | `dark` | 27/34 |
| search | `storefront` | 21/25 |
| search | `dark` | 20/25 |
| coupons | `storefront` | 16/21 |
| coupons | `dark` | 15/21 |
| login | `storefront` | 9/16 |
| login | `dark` | 10/16 |
| cart | `storefront` | 7/13 |
| cart | `dark` | 8/13 |
| checkout | `storefront` | 5/11 |
| checkout | `dark` | 6/11 |
| confirmation | `storefront` | 8/13 |
| confirmation | `dark` | 7/13 |
| account | `storefront` | 9/16 |
| account | `dark` | 10/16 |
| orders | `storefront` | 9/16 |
| orders | `dark` | 10/16 |
| order-detail | `storefront` | 9/16 |
| order-detail | `dark` | 10/16 |
| admin-dashboard | `admin` | 9/16 |
| admin-dashboard | `admin-dark` | 9/16 |
| admin-products | `admin` | 9/16 |
| admin-products | `admin-dark` | 10/16 |
| admin-orders | `admin` | 9/16 |
| admin-orders | `admin-dark` | 10/16 |

### Skip-list (hợp lệ theo spec)
- (không có)

---

**VERDICT: FAIL** — 602 elements đo được; real-bug 43 (ngoài 2 item đã biết: 37 → SF-2/pdp/dark/pdp-chip; SF-2/pdp/dark/pdp-stepper-btn; SF-2/coupons/dark/coupon-copy; SF-3/login/dark/a; SF-4/login/dark/a; SF-3/login/dark/button; SF-1/login/dark/uk-btn__label; SF-3/cart/dark/a; SF-3/cart/dark/button; SF-1/cart/dark/uk-btn__label; SF-3/checkout/dark/a; SF-3/checkout/dark/a; SF-3/checkout/dark/button; SF-3/confirmation/dark/a; SF-3/confirmation/dark/a; SF-3/confirmation/dark/a; SF-3/confirmation/dark/button; SF-3/account/dark/a; SF-4/account/dark/a; SF-3/account/dark/button; SF-1/account/dark/uk-btn__label; SF-3/orders/dark/a; SF-4/orders/dark/a; SF-3/orders/dark/button; SF-1/orders/dark/uk-btn__label; SF-3/order-detail/dark/a; SF-4/order-detail/dark/a; SF-3/order-detail/dark/button; SF-1/order-detail/dark/uk-btn__label; SF-3/admin-products/admin-dark/a; SF-5/admin-products/admin-dark/a; SF-3/admin-products/admin-dark/button; SF-1/admin-products/admin-dark/uk-btn__label; SF-3/admin-orders/admin-dark/a; SF-5/admin-orders/admin-dark/a; SF-3/admin-orders/admin-dark/button; SF-1/admin-orders/admin-dark/uk-btn__label), AA-note 152 (đã liệt kê đầy đủ).

---

## Coordinator adjudication — FINAL v2 (2026-09-09, sửa sau khi probe shell :5703 trực tiếp)

**SỬA SO VỚI ADJUDICATION v1:** v1 phán "mini-nav 'Danh mục' + 'Tìm kiếm' = artifact" dựa trên probe STOREFRONT :3101 header — SAI PHẠM VI: shell :5703 là HEADER COMPONENT KHÁC (SF-3). Probe trực tiếp trên shell /cart dark: `nav a` 'Danh mục' = rgb(30,30,30) trên đỏ, search-btn 'Tìm kiếm' = rgb(30,30,30) trên đỏ — EXECUTOR ĐÚNG về family này. Storefront :3101 probe = trắng (đúng design) — 2 header khác code.

### Real-bug fix-tasks CHỐT (4 roots — re-run sweep sau khi fix merge)
| # | SF | Root | Evidence | Ratio |
|---|----|------|----------|-------|
| 1 | SF-2 | storefront `.theme-toggle`/action chip (dark): chip sáng #EFEFEF + label #F5F5F5 | ảnh rule0-home-dark-header.png, rule0-plp-dark-brand-input.png | 1.05 |
| 2 | SF-2 | `.plp-brand-input` (dark): text #F5F5F5 trên bg #FFFFFF, gõ vô hình | ảnh rule0-plp-dark-brand-input.png | 1.09 |
| 3 | SF-1 | `uk-btn` primary label (dark): #1E1E1E trên #F53D2D không flip theme — mọi surface | probe + ảnh rule0-login-dark.png | ~3.7 |
| 4 | SF-3 | SHELL header (dark): mini-nav links + search-btn text flip sang --c-text tối trên nền primary giữ nguyên | probe shell :5703 /cart dark = rgb(30,30,30); ảnh rule0-shell-cart-dark-header.png | 4.44 |

Ghi chú: executor run-3 liệt kê ~37 instances = 4 roots trên (một root, nhiều page). Owner theo ROOT component, không theo page: shell header family → SF-3; uk-btn → SF-1; theme-toggle/brand-input storefront → SF-2. PDP chip/stepper dark 'M'/'+' đen trên #1E1E1E (1.26) — NIỀM TIN CAO là bug cùng họ brand-input (SF-2 PDP) nhưng chưa probe riêng (PDP đo là product stock-0 disabled-state) → gộp vào fix-task SF-2 kèm yêu cầu verify khi fix.

### Artifact — probe lại PASS (giữ nguyên từ v1)
- storefront mini-nav/search-btn :3101 = trắng đúng design (không phải bug).
- `pdp-stepper-btn` disabled: WCAG miễn trừ; node enabled = 4.6 PASS.
- confirmation `/skeleton` + `/ui-kit` default-blue anchors: fail-loud FALLBACK UI — P2 note (fallback anchors nên style token).

### AA design-exception notes (brand-lock Q1 — không fix trong epic)
Trắng trên primary/gradient (hero 2.59-3.76, MUA NGAY 2.59) — design §2.2/§2.3 chỉ định · accent-on-primary 2.71 (§2.1) · muted-on-bg 4.23 · link #F53D2D trên dark 4.44 (token --c-link dark) · coupon-copy 4.44 · 'đăng nhập' trên tint 3.89 + Bảng 2 run-3 (152 item).

**VERDICT CHỐT v2: FAIL với 4 real-bug roots (SF-2 ×2, SF-1 ×1, SF-3 ×1) — đủ điều kiện fix-task.**
