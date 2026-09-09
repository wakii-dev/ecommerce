# Dark-mode 4-state contrast sweep (FI-396 / T2) — Round 0 tooling fix

> **Round 0 tooling fix — kết quả trước đó (148 fail) bao gồm false-fail gradient/node; số trong báo cáo này THAY THẾ.**

> Phương pháp: **scripted** — contrast WCAG 2.x đo từ computed styles per theme trên rig sống (không thuần mắt). Background effective: leo ancestor tới lớp opaque đầu tiên; element nền **gradient** → parse color-stops, dùng stop giữa (`bgSource: gradient`); html transparent → `--c-bg`. Chỉ đo node **thực sự render glyph** (direct text node hoặc descendant sâu nhất — anchor cha màu default-blue không còn bị đo nhầm). Node ẩn (`display:none`, `offsetParent` null) không đo.

- Ngày chạy: 2026-09-09T00:59:18.247Z
- Rig: storefront http://127.0.0.1:3101 · shell http://localhost:5703
- 4 trạng thái theme: `storefront` (light) · `dark` · `admin` (light) · `admin-dark` — flip qua `data-theme` trên `<html>`, đúng cơ chế của apps (4 blocks trong `packages/ui-kit/src/styles/tokens.css`)
- Ngưỡng: text thường ≥ 4.5; large text (≥24px hoặc ≥18.66px bold) ≥ 3.0; UI component badge/pill ≥ 3.0
- Evidence đầy đủ per element: `scripts/qa/contrast-results.json` (544 elements đo được)

## Ghi chú chạy
- PDP slug chọn: sf4-order-1788904546455
- Login: shell /login là OAuth flow (IdP redirect, không phải password-fill thuần) → cart/checkout/account/orders/admin đo ở guest-guard state trên shell :5703, guard screen vẫn render bằng theme tokens thật (admin-dark v.v.)
- Real-bug ngoài 2 item đã biết (theme-toggle dark, plp-brand-input dark): 52 → SF-2/home/hero-kicker; SF-2/home/hero-title; SF-2/home/hero-kicker; SF-2/home/hero-title; SF-2/home/header-action-label; SF-2/plp-cong-nghe/header-action-label; SF-2/pdp/pdp-cta pdp-cta--primary; SF-2/pdp/header-action-label; SF-2/pdp/pdp-chip; SF-2/pdp/pdp-stepper-btn; SF-2/pdp/pdp-cta pdp-cta--primary; SF-2/search/header-action-label; SF-2/coupons/header-action-label; SF-2/coupons/coupon-copy; SF-4/login/; SF-4/login/; SF-4/login/; SF-1/login/uk-btn__label; SF-3/cart/; SF-3/cart/; SF-1/cart/uk-btn__label; SF-3/checkout/; SF-3/checkout/; SF-3/checkout/; SF-3/confirmation/; SF-3/confirmation/; SF-3/confirmation/; SF-3/confirmation/; SF-4/account/; SF-4/account/; SF-4/account/; SF-1/account/uk-btn__label; SF-4/orders/; SF-4/orders/; SF-4/orders/; SF-1/orders/uk-btn__label; SF-4/order-detail/; SF-4/order-detail/; SF-4/order-detail/; SF-1/order-detail/uk-btn__label; SF-5/admin-dashboard/; SF-5/admin-dashboard/; SF-5/admin-dashboard/; SF-1/admin-dashboard/uk-btn__label; SF-5/admin-products/; SF-5/admin-products/; SF-5/admin-products/; SF-1/admin-products/uk-btn__label; SF-5/admin-orders/; SF-5/admin-orders/; SF-5/admin-orders/; SF-1/admin-orders/uk-btn__label

**Phân loại: 52 real-bug (fix-task) · 141 AA design-exception (brand-lock) · verdict rule: PASS nếu real-bug chỉ gồm 2 item đã biết (theme-toggle dark + plp-brand-input dark) trở xuống VÀ AA-notes đầy đủ**

## Verdict per page × theme

| Page | Theme | SF | Pass | Fail | Ghi chú |
|------|-------|----|------|------|---------|
| home | `storefront` | SF-2 | 33 | **10** | — |
| home | `dark` | SF-2 | 32 | **11** | — |
| plp-cong-nghe | `storefront` | SF-2 | 19 | **5** | — |
| plp-cong-nghe | `dark` | SF-2 | 19 | **5** | — |
| pdp | `storefront` | SF-2 | 20 | **11** | — |
| pdp | `dark` | SF-2 | 24 | **7** | — |
| search | `storefront` | SF-2 | 19 | **4** | — |
| search | `dark` | SF-2 | 18 | **5** | — |
| coupons | `storefront` | SF-2 | 14 | **5** | — |
| coupons | `dark` | SF-2 | 13 | **6** | — |
| login | `storefront` | SF-4 | 7 | **7** | login surface (auth form) — legitimate UI |
| login | `dark` | SF-4 | 8 | **6** | login surface (auth form) — legitimate UI |
| cart | `storefront` | SF-3 | 6 | **6** | — |
| cart | `dark` | SF-3 | 7 | **5** | — |
| checkout | `storefront` | SF-3 | 4 | **6** | step 1; steps 2-3 cần order+login state — bỏ qua theo spec |
| checkout | `dark` | SF-3 | 5 | **5** | step 1; steps 2-3 cần order+login state — bỏ qua theo spec |
| confirmation | `storefront` | SF-3 | 7 | **5** | — |
| confirmation | `dark` | SF-3 | 6 | **6** | — |
| account | `storefront` | SF-4 | 7 | **7** | — |
| account | `dark` | SF-4 | 8 | **6** | — |
| orders | `storefront` | SF-4 | 7 | **7** | — |
| orders | `dark` | SF-4 | 8 | **6** | — |
| order-detail | `storefront` | SF-4 | 7 | **7** | không có order state → đo not-found/guard state nếu render |
| order-detail | `dark` | SF-4 | 8 | **6** | không có order state → đo not-found/guard state nếu render |
| admin-dashboard | `admin` | SF-5 | 7 | **7** | — |
| admin-dashboard | `admin-dark` | SF-5 | 8 | **6** | — |
| admin-products | `admin` | SF-5 | 7 | **7** | — |
| admin-products | `admin-dark` | SF-5 | 8 | **6** | — |
| admin-orders | `admin` | SF-5 | 7 | **7** | — |
| admin-orders | `admin-dark` | SF-5 | 8 | **6** | — |

## Bảng 1 — Real-bug fix-tasks (coordinator quyết định — executor KHÔNG sửa app code)

| SF | Page | Theme | Element | Text | Màu chữ | Nền effective | bgSource | Ratio | Ngưỡng |
|----|------|-------|---------|------|---------|---------------|----------|-------|--------|
| SF-2 | home | `storefront` | body-text (`hero-kicker`) | Siêu sale cuối tuần | `rgb(255, 255, 255)` | `#ff7a45` | gradient | **2.59** | 4.5 |
| SF-2 | home | `storefront` | heading (`hero-title`) | Giảm đến 50% Điện Tử | `rgb(255, 255, 255)` | `#ff7a45` | gradient | **2.59** | 3 |
| SF-2 | home | `dark` | body-text (`hero-kicker`) | Siêu sale cuối tuần | `rgb(255, 255, 255)` | `#ff7a45` | gradient | **2.59** | 4.5 |
| SF-2 | home | `dark` | heading (`hero-title`) | Giảm đến 50% Điện Tử | `rgb(255, 255, 255)` | `#ff7a45` | gradient | **2.59** | 3 |
| SF-2 | home | `dark` | button (`header-action-label`) | Tối | `rgb(245, 245, 245)` | `#efefef` | ancestor-blend | **1.05** | 4.5 |
| SF-2 | plp-cong-nghe | `dark` | button (`header-action-label`) | Tối | `rgb(245, 245, 245)` | `#efefef` | ancestor-blend | **1.05** | 4.5 |
| SF-2 | pdp | `storefront` | button (`pdp-cta pdp-cta--primary`) | MUA NGAY | `rgb(255, 255, 255)` | `#ff7a45` | gradient | **2.59** | 4.5 |
| SF-2 | pdp | `dark` | button (`header-action-label`) | Tối | `rgb(245, 245, 245)` | `#efefef` | ancestor-blend | **1.05** | 4.5 |
| SF-2 | pdp | `dark` | button (`pdp-chip`) | M | `rgb(0, 0, 0)` | `#1e1e1e` | ancestor-blend | **1.26** | 4.5 |
| SF-2 | pdp | `dark` | button (`pdp-stepper-btn`) | + | `rgb(0, 0, 0)` | `#1e1e1e` | ancestor-blend | **1.26** | 4.5 |
| SF-2 | pdp | `dark` | button (`pdp-cta pdp-cta--primary`) | MUA NGAY | `rgb(255, 255, 255)` | `#ff7a45` | gradient | **2.59** | 4.5 |
| SF-2 | search | `dark` | button (`header-action-label`) | Tối | `rgb(245, 245, 245)` | `#efefef` | ancestor-blend | **1.05** | 4.5 |
| SF-2 | coupons | `dark` | button (`header-action-label`) | Tối | `rgb(245, 245, 245)` | `#efefef` | ancestor-blend | **1.05** | 4.5 |
| SF-2 | coupons | `dark` | button (`coupon-copy`) | Sao chép | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | login | `dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | login | `dark` | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | login | `dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | login | `dark` | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-3 | cart | `dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-3 | cart | `dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | cart | `dark` | button (`uk-btn__label`) | Về trang chủ | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-3 | checkout | `dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-3 | checkout | `dark` | link (`a`) | đăng nhập | `rgb(245, 61, 45)` | `#33270e` | ancestor-blend | **3.89** | 4.5 |
| SF-3 | checkout | `dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-3 | confirmation | `dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-3 | confirmation | `dark` | link (`a`) | /skeleton — nạp remote "skelet | `rgb(0, 0, 238)` | `#121212` | ancestor-blend | **1.99** | 4.5 |
| SF-3 | confirmation | `dark` | link (`a`) | /ui-kit — demo @ecommerce/ui-k | `rgb(0, 0, 238)` | `#121212` | ancestor-blend | **1.99** | 4.5 |
| SF-3 | confirmation | `dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | account | `dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | account | `dark` | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | account | `dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | account | `dark` | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | orders | `dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | orders | `dark` | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | orders | `dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | orders | `dark` | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | order-detail | `dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | order-detail | `dark` | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-4 | order-detail | `dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | order-detail | `dark` | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-dashboard | `admin-dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-dashboard | `admin-dark` | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-dashboard | `admin-dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | admin-dashboard | `admin-dark` | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-products | `admin-dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-products | `admin-dark` | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-products | `admin-dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | admin-products | `admin-dark` | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-orders | `admin-dark` | link (`a`) | Danh mục | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-orders | `admin-dark` | link (`a`) | Đăng ký | `rgb(245, 61, 45)` | `#1e1e1e` | ancestor-blend | **4.44** | 4.5 |
| SF-5 | admin-orders | `admin-dark` | button (`button`) | Tìm kiếm | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |
| SF-1 | admin-orders | `admin-dark` | button (`uk-btn__label`) | Đăng nhập | `rgb(30, 30, 30)` | `#f53d2d` | ancestor-blend | **4.44** | 4.5 |

### Fix-task proposals

- [SF-2] `home` × `storefront` — body-text `hero-kicker`: ratio 2.59 < 4.5 (normal text 1.4.3); color `rgb(255, 255, 255)` trên `#ff7a45` (gradient); text "Siêu sale cuối tuần"
- [SF-2] `home` × `storefront` — heading `hero-title`: ratio 2.59 < 3 (large text 1.4.3); color `rgb(255, 255, 255)` trên `#ff7a45` (gradient); text "Giảm đến 50% Điện Tử"
- [SF-2] `home` × `dark` — body-text `hero-kicker`: ratio 2.59 < 4.5 (normal text 1.4.3); color `rgb(255, 255, 255)` trên `#ff7a45` (gradient); text "Siêu sale cuối tuần"
- [SF-2] `home` × `dark` — heading `hero-title`: ratio 2.59 < 3 (large text 1.4.3); color `rgb(255, 255, 255)` trên `#ff7a45` (gradient); text "Giảm đến 50% Điện Tử"
- [SF-2] `home` × `dark` — button `header-action-label`: ratio 1.05 < 4.5 (normal text 1.4.3); color `rgb(245, 245, 245)` trên `#efefef` (ancestor-blend); text "Tối"
- [SF-2] `plp-cong-nghe` × `dark` — button `header-action-label`: ratio 1.05 < 4.5 (normal text 1.4.3); color `rgb(245, 245, 245)` trên `#efefef` (ancestor-blend); text "Tối"
- [SF-2] `pdp` × `storefront` — button `pdp-cta pdp-cta--primary`: ratio 2.59 < 4.5 (normal text 1.4.3); color `rgb(255, 255, 255)` trên `#ff7a45` (gradient); text "MUA NGAY"
- [SF-2] `pdp` × `dark` — button `header-action-label`: ratio 1.05 < 4.5 (normal text 1.4.3); color `rgb(245, 245, 245)` trên `#efefef` (ancestor-blend); text "Tối"
- [SF-2] `pdp` × `dark` — button `pdp-chip`: ratio 1.26 < 4.5 (normal text 1.4.3); color `rgb(0, 0, 0)` trên `#1e1e1e` (ancestor-blend); text "M"
- [SF-2] `pdp` × `dark` — button `pdp-stepper-btn`: ratio 1.26 < 4.5 (normal text 1.4.3); color `rgb(0, 0, 0)` trên `#1e1e1e` (ancestor-blend); text "+"
- [SF-2] `pdp` × `dark` — button `pdp-cta pdp-cta--primary`: ratio 2.59 < 4.5 (normal text 1.4.3); color `rgb(255, 255, 255)` trên `#ff7a45` (gradient); text "MUA NGAY"
- [SF-2] `search` × `dark` — button `header-action-label`: ratio 1.05 < 4.5 (normal text 1.4.3); color `rgb(245, 245, 245)` trên `#efefef` (ancestor-blend); text "Tối"
- [SF-2] `coupons` × `dark` — button `header-action-label`: ratio 1.05 < 4.5 (normal text 1.4.3); color `rgb(245, 245, 245)` trên `#efefef` (ancestor-blend); text "Tối"
- [SF-2] `coupons` × `dark` — button `coupon-copy`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Sao chép"
- [SF-4] `login` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-4] `login` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-4] `login` × `dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `login` × `dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"
- [SF-3] `cart` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-3] `cart` × `dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `cart` × `dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Về trang chủ"
- [SF-3] `checkout` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-3] `checkout` × `dark` — link `a`: ratio 3.89 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#33270e` (ancestor-blend); text "đăng nhập"
- [SF-3] `checkout` × `dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-3] `confirmation` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-3] `confirmation` × `dark` — link `a`: ratio 1.99 < 4.5 (normal text 1.4.3); color `rgb(0, 0, 238)` trên `#121212` (ancestor-blend); text "/skeleton — nạp remote "skeleton/Page" q"
- [SF-3] `confirmation` × `dark` — link `a`: ratio 1.99 < 4.5 (normal text 1.4.3); color `rgb(0, 0, 238)` trên `#121212` (ancestor-blend); text "/ui-kit — demo @ecommerce/ui-kit (2 them"
- [SF-3] `confirmation` × `dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-4] `account` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-4] `account` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-4] `account` × `dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `account` × `dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"
- [SF-4] `orders` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-4] `orders` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-4] `orders` × `dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `orders` × `dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"
- [SF-4] `order-detail` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-4] `order-detail` × `dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-4] `order-detail` × `dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `order-detail` × `dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"
- [SF-5] `admin-dashboard` × `admin-dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-5] `admin-dashboard` × `admin-dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-5] `admin-dashboard` × `admin-dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `admin-dashboard` × `admin-dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"
- [SF-5] `admin-products` × `admin-dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-5] `admin-products` × `admin-dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-5] `admin-products` × `admin-dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `admin-products` × `admin-dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"
- [SF-5] `admin-orders` × `admin-dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Danh mục"
- [SF-5] `admin-orders` × `admin-dark` — link `a`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(245, 61, 45)` trên `#1e1e1e` (ancestor-blend); text "Đăng ký"
- [SF-5] `admin-orders` × `admin-dark` — button `button`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Tìm kiếm"
- [SF-1] `admin-orders` × `admin-dark` — button `uk-btn__label`: ratio 4.44 < 4.5 (normal text 1.4.3); color `rgb(30, 30, 30)` trên `#f53d2d` (ancestor-blend); text "Đăng nhập"

## Bảng 2 — AA design-exception notes (brand-lock epic Q1 — KHÔNG phải fix-task, cấm đổi hex)

| Combo | SF | Page | Theme | Element | Ratio | Guideline exception |
|-------|----|------|-------|---------|-------|---------------------|
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | body-text `hero-kicker` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | body-text `hero-kicker` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | home | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | link `badge-off` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | home | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | plp-cong-nghe | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | plp-cong-nghe | `storefront` | button `plp-brand-btn` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | plp-cong-nghe | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | plp-cong-nghe | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | plp-cong-nghe | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | plp-cong-nghe | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | pdp | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-2 | pdp | `storefront` | link `a` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-2 | pdp | `storefront` | link `a` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | pdp | `storefront` | link `pdp-meta-count` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | pdp | `storefront` | button `pdp-cta pdp-cta--secondary` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-1 | pdp | `storefront` | button `uk-tab uk-tab--active` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-1 | pdp | `storefront` | button `uk-tab` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| muted #757575 trên bg #F5F5F5 (breadcrumb) | SF-1 | pdp | `storefront` | button `uk-tab` | **4.23** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | pdp | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | pdp | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | search | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | search | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | search | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | search | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | search | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | coupons | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-2 | coupons | `storefront` | button `coupon-copy` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | coupons | `storefront` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | coupons | `dark` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-2 | coupons | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-2 | coupons | `dark` | button `nl-submit` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | login | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | login | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | login | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | login | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | login | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | login | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
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
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | account | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | account | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | account | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | account | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | account | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | account | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | orders | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | orders | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | orders | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | orders | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | orders | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | orders | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | order-detail | `storefront` | link `um-guest__register` | **3.45** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | order-detail | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `storefront` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-4 | order-detail | `storefront` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-4 | order-detail | `storefront` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | order-detail | `storefront` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-4 | order-detail | `dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-dashboard | `admin` | link `um-guest__register` | **3.27** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-5 | admin-dashboard | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-dashboard | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-5 | admin-dashboard | `admin` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | admin-dashboard | `admin` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-dashboard | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-products | `admin` | link `um-guest__register` | **3.27** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-5 | admin-products | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-products | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-5 | admin-products | `admin` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | admin-products | `admin` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-products | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-orders | `admin` | link `um-guest__register` | **3.27** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-5 | admin-orders | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| primary #F53D2D link/tab-active trên bg sáng | SF-5 | admin-orders | `admin` | link `a` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-5 | admin-orders | `admin` | button `button` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| trắng trên primary #F53D2D (brand direction §2.1) | SF-1 | admin-orders | `admin` | button `uk-btn__label` | **3.76** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |
| accent #FFD839 trên primary #F53D2D (mini-nav hot items — direction §2.1) | SF-5 | admin-orders | `admin-dark` | link `accent` | **2.71** | WCAG 1.4.3 — brand/Logotype-style exception (brand direction §2.1, epic Q1 lock) *(lặp combo)* |

> Các combo này là lựa chọn brand có chủ ý (direction §2.1) — ghi nhận để audit, KHÔNG tạo fix-task. Nếu sau này brand nới lock, ưu tiên tăng độ đậm/kích thước hoặc đổi nền region thay vì đổi hex token.

## Bảng 3 — Pass summary

- Tổng elements đo được: **544** trên 30 page×theme combo
- Pass: **351** · Fail: **193** (real-bug 52 + AA-note 141)

| Page | Theme | Pass/Total |
|------|-------|------------|
| home | `storefront` | 33/43 |
| home | `dark` | 32/43 |
| plp-cong-nghe | `storefront` | 19/24 |
| plp-cong-nghe | `dark` | 19/24 |
| pdp | `storefront` | 20/31 |
| pdp | `dark` | 24/31 |
| search | `storefront` | 19/23 |
| search | `dark` | 18/23 |
| coupons | `storefront` | 14/19 |
| coupons | `dark` | 13/19 |
| login | `storefront` | 7/14 |
| login | `dark` | 8/14 |
| cart | `storefront` | 6/12 |
| cart | `dark` | 7/12 |
| checkout | `storefront` | 4/10 |
| checkout | `dark` | 5/10 |
| confirmation | `storefront` | 7/12 |
| confirmation | `dark` | 6/12 |
| account | `storefront` | 7/14 |
| account | `dark` | 8/14 |
| orders | `storefront` | 7/14 |
| orders | `dark` | 8/14 |
| order-detail | `storefront` | 7/14 |
| order-detail | `dark` | 8/14 |
| admin-dashboard | `admin` | 7/14 |
| admin-dashboard | `admin-dark` | 8/14 |
| admin-products | `admin` | 7/14 |
| admin-products | `admin-dark` | 8/14 |
| admin-orders | `admin` | 7/14 |
| admin-orders | `admin-dark` | 8/14 |

### Skip-list (hợp lệ theo spec)
- (không có)

---

**VERDICT: FAIL** — 544 elements đo được; real-bug 52 (ngoài 2 item đã biết: 52 → SF-2/home/storefront/hero-kicker; SF-2/home/storefront/hero-title; SF-2/home/dark/hero-kicker; SF-2/home/dark/hero-title; SF-2/home/dark/header-action-label; SF-2/plp-cong-nghe/dark/header-action-label; SF-2/pdp/storefront/pdp-cta pdp-cta--primary; SF-2/pdp/dark/header-action-label; SF-2/pdp/dark/pdp-chip; SF-2/pdp/dark/pdp-stepper-btn; SF-2/pdp/dark/pdp-cta pdp-cta--primary; SF-2/search/dark/header-action-label; SF-2/coupons/dark/header-action-label; SF-2/coupons/dark/coupon-copy; SF-4/login/dark/a; SF-4/login/dark/a; SF-4/login/dark/button; SF-1/login/dark/uk-btn__label; SF-3/cart/dark/a; SF-3/cart/dark/button; SF-1/cart/dark/uk-btn__label; SF-3/checkout/dark/a; SF-3/checkout/dark/a; SF-3/checkout/dark/button; SF-3/confirmation/dark/a; SF-3/confirmation/dark/a; SF-3/confirmation/dark/a; SF-3/confirmation/dark/button; SF-4/account/dark/a; SF-4/account/dark/a; SF-4/account/dark/button; SF-1/account/dark/uk-btn__label; SF-4/orders/dark/a; SF-4/orders/dark/a; SF-4/orders/dark/button; SF-1/orders/dark/uk-btn__label; SF-4/order-detail/dark/a; SF-4/order-detail/dark/a; SF-4/order-detail/dark/button; SF-1/order-detail/dark/uk-btn__label; SF-5/admin-dashboard/admin-dark/a; SF-5/admin-dashboard/admin-dark/a; SF-5/admin-dashboard/admin-dark/button; SF-1/admin-dashboard/admin-dark/uk-btn__label; SF-5/admin-products/admin-dark/a; SF-5/admin-products/admin-dark/a; SF-5/admin-products/admin-dark/button; SF-1/admin-products/admin-dark/uk-btn__label; SF-5/admin-orders/admin-dark/a; SF-5/admin-orders/admin-dark/a; SF-5/admin-orders/admin-dark/button; SF-1/admin-orders/admin-dark/uk-btn__label), AA-note 141 (đã liệt kê đầy đủ).

## Coordinator adjudication (2026-09-09 — Rule 0, tự probe + tự nhìn screenshots)

52 "real-bug" của script được chia lại thành 3 nhóm sau khi coordinator probe trực tiếp (eval computed style trên node đúng) + nhìn screenshots (`walkthrough/rule0-*.png`):

### Real-bug fix-tasks CHỐT (3)
| # | SF | Element | Bằng chứng | Ratio |
|---|----|---------|-----------|-------|
| 1 | SF-2 | `.theme-toggle`/header-action-label (dark) | chip sáng #EFEFEF + label #F5F5F5 — ảnh `rule0-home-dark-header.png`, `rule0-plp-dark-brand-input.png` | 1.05 |
| 2 | SF-2 | `.plp-brand-input` (dark) | text #F5F5F5 trên bg #FFFFFF, gõ 'ASUS' vô hình — ảnh `rule0-plp-dark-brand-input.png` | 1.09 |
| 3 | SF-1 | `uk-btn` primary label (dark) | label #1E1E1E trên #F53D2D KHÔNG flip theo theme — probe trực tiếp + ảnh `rule0-login-dark.png`; fail xuất hiện trên mọi surface (SF-3/4/5 đều dính) → root ở primitive | ~3.7 |

### Artifact (bỏ khỏi fail-list — script đo sai node/state, coordinator probe lại = PASS)
- mini-nav `a` 'Danh mục' #1E1E1E → probe trực tiếp = `rgb(255,255,255)` trắng (khớp design §2.1); script đo nhầm (stale CSS hoặc node khác).
- `button` 'Tìm kiếm' #1E1E1E → ảnh header: icon/text TRẮNG trên đỏ — artifact.
- `pdp-stepper-btn`/`pdp-chip` #000 → node này PDP đo là disabled/1-variant không render chip; probe node enabled = #9E9E9E trên #1E1E1E = **4.6 PASS**; disabled控件 được WCAG miễn trừ.
- confirmation `/skeleton` + `/ui-kit` default-blue links → là fail-loud FALLBACK UI (remote timing lúc script ghé, raw anchor không style) — trạng thái lỗi trung thực, không phải styled-page bug (P2 note: fallback anchors nên có style token).
- `uk-btn__label` các dòng còn lại = cùng root với real-bug #3 (đã gộp).

### AA design-exception notes (brand-lock Q1 — cấm đổi hex, giữ nguyên làm note)
Giữ nguyên Bảng 2 (141 item) + bổ sung: hero-kicker/hero-title/MUA NGAY trắng trên gradient (2.59 vs middle-stop; trên stop #F53D2D = 3.76) — white-on-primary/gradient là design §2.2/§2.3 chỉ định; 'Đăng ký'/'Đăng nhập' link #F53D2D trên #1E1E1E (4.44); coupon-copy 4.44; checkout 'đăng nhập' trên tint (3.89). Mọi fix của nhóm này bắt buộc đổi token value → vi phạm brand-lock → chỉ ghi nhận cho epic cân nhắc (P3, ngoài scope SF-6).

**VERDICT (adjudicated): FAIL với 3 real-bug fix-tasks (SF-2 ×2, SF-1 ×1) — đã đủ điều kiện sinh fix-task; còn lại AA-notes.**
