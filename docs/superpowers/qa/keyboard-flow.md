# QA T5 — A11y Keyboard-only Purchase Flow (FI-396 / SF-6 convergence-qa)

- **Ngày:** 2026-09-09
- **Rig:** storefront Next `:3101` · shell MFE `:5703` (checkout/account) · gateway `:8080` · seed `user@demo.vn / Demo#2026` · thanh toán COD
- **Phương pháp:** script `scripts/qa/keyboard-flow.mjs` — Playwright headless shell, chỉ dùng `page.keyboard` (Tab/Shift-less/Enter/Space/Arrow/Escape/gõ chữ). **Không** `locator.click()`, **không** `page.mouse`, không synthetic KeyboardEvent → mọi event là trusted input nên `:focus-visible` phản ánh đúng người dùng bàn phím thật. Mỗi bước ghi phím đã bấm, element focus di chuyển tới, computed outline (`getComputedStyle`) + `matches(':focus-visible')`, kèm screenshot.
- **Kết luận: PASS** — đi trọn flow mua hàng đến `/order/confirmation` bằng keyboard thuần, **không có focus-trap chết** (mọi overlay ESC đóng được, Tab trong drawer wrap không escape). 9/9 bước PASS; các gap nhỏ liệt kê riêng, không chặn flow chính.

## 1. Bảng bước × phím × kết quả

| # | Bước | Phím chính | Focus di chuyển | Kết quả |
|---|------|------------|-----------------|---------|
| S1 | Storefront home — tab order | `Tab` ×14 | logo → search combobox → Tìm kiếm → locale switch → dark-toggle → Giỏ hàng → Tài khoản → nav (Danh mục/Hàng mới/Bán chạy) → hero CTA → hero arrows → hero dots | **PASS** — thứ tự hợp lý (header → nav → main), không focus rơi vào element ẩn (0 stop `[HIDDEN]`) |
| S2 | Login `:5703/account` → redirect `/login` | `Tab` → gõ email → `Tab` → gõ mật khẩu → `Enter` | email → password → submit | **PASS** — submit bằng Enter, redirect về `/account`, session cookie OK. SĐT-style input đúng: password là `input[type=password]`, có nút "Hiện mật khẩu" riêng tab-reachable |
| S3 | Search "xiaomi" → PLP → PDP | `Tab` tới search → gõ → `Enter` → `Tab` tới card → `Enter` | search → PLP `/search?q=xiaomi` → `a.p-card` → PDP `/p/tai-nghe-bluetooth-xiaomi-redmi-buds-4` | **PASS** — product card là `<a href="/p/...">` tab-reachable, Enter mở PDP |
| S4 | PDP — THÊM VÀO GIỎ | `Tab` → `Enter` | qty stepper (`input[type=number]`, "–" DIS khi qty=1) → THÊM VÀO GIỎ | **PASS** — `POST :3101/api/cart/items → 200`; badge shell tăng lên "Giỏ hàng — 1 sản phẩm". PDP này single-variant (không có chip variant — xem gap G6) |
| S5 | Mini-cart drawer (shell header) | `Enter` trên trigger → `Tab` ×12 → `Escape` | focus vào `button.uk-modal__close "Đóng"` ngay khi mở → wrap Đóng ↔ Xem giỏ hàng ↔ Thanh toán → ESC | **PASS** — drawer mở, focus di vào trong, 12 Tab không escape, ESC đóng. (Gap G2: sau ESC focus rơi về `body`, không restore trigger) |
| S6 | Cart `:5703/cart` — stepper + xóa line | `ArrowUp` trên qty input → `Enter` "Xóa" → `Escape` (modal) → `Enter` "Xóa" → `Enter` confirm | qty spinbutton → modal (focus vào Đóng) → ESC → confirm button | **PASS** — `ArrowUp` 5→6 hoạt động trên native spinbutton; modal confirm mở/focus/ESC OK; Enter trên confirm xóa thật (badge → 0); re-add từ PDP bằng keyboard OK |
| S7 | Checkout 3 bước → đặt hàng | gõ 6 field → `Enter` "Tiếp tục" → `Space` radio shipping → `Enter` "Tiếp tục" → `ArrowDown`+`Space` radio COD → `Enter` "Kiểm tra & tạo đơn" | step1 form → step2 radios → step3 payment → confirm | **PASS** — `POST :5703/api/ordering/orders → 201`, `DELETE cart item → 200`, redirect `/order/confirmation`. SĐT `inputmode=tel` (chỉ gõ số OK). Radio group dùng roving tabindex: Tab chỉ dừng radio đang checked, `ArrowDown` di chuyển đúng chuẩn ARIA |
| S8 | Confirmation | `Tab` ×8 → `Tab` tới CTA → `Enter` | CTA "Tiếp tục mua sắm" (focus đầu trang content) → header | **PASS** — CTA Enter về trang chủ OK. (Trang confirmation không có nút "Về trang chủ" đúng chữ; CTA thực tế là "Tiếp tục mua sắm" — hoạt động) |
| S9 | User menu (header shell) | `Enter` trigger → `ArrowDown` ×2 → `Escape` | `button.um-trigger "Nguyen"` → menu `role=menu` mở, focus item đầu ("Tài khoản") → arrow-nav giữa items → ESC | **PASS** — arrow-key works, ESC đóng, **focus restore đúng về trigger** (menu này chuẩn) |

## 2. Focus-visible evidence (computed outline)

| Vùng / element | `:focus-visible` | outline computed | Nhận xét |
|---|---|---|---|
| Storefront `:3101` — links/buttons (logo, p-card, hero, uk-btn…) | true | `solid 2px rgb(245,61,45)` (nhiều nơi + box-shadow) | Ring đỏ rõ, tốt |
| Shell `:5703` — header items, drawer/modal/menu buttons | true | `auto 1px rgb(0,95,204)` | Ring xanh mặc định UA, thấy được |
| ui-kit input (`uk-input` — login email/password) | true | `none` **+ box-shadow ring** | OK — ring qua box-shadow |
| **Search input (cả storefront `search-input` lẫn shell header `input[type=search]`)** | true | **`none 3px` — KHÔNG box-shadow** | **GAP G1**: `:focus-visible` bậc nhưng không có indicator nhìn thấy được |

Không có bước nào trong flow chính bị focus invisible ngoài G1. Không ghi nhận element focus được nhưng `[HIDDEN]`.

## 3. Focus-trap tests

| Overlay | Mở bằng | Tab trong overlay | ESC | Kết luận |
|---|---|---|---|---|
| Mini-cart drawer (`dialog.uk-drawer`) | Enter trên badge trigger | 12 Tab: wrap nội bộ (Đóng ↔ Xem giỏ hàng ↔ Thanh toán ↔ item), **không escape** ra trang nền | Đóng được | Không trap chết. Gap G2: focus sau ESC về `body` thay vì trigger |
| Confirm xóa line (`dialog.uk-modal`) | Enter "Xóa" | Focus vào "Đóng" khi mở; các nút modal tab được | Đóng được | Không trap chết. Gap G2 tương tự |
| User menu (`menu.um-menu`) | Enter trigger | ArrowDown di chuyển items (roving) | Đóng, **focus restore trigger** | Chuẩn — đối chiếu tốt cho G2 |

## 4. Keyboard-gap list

| # | Gap | Mức | Chi tiết |
|---|-----|-----|----------|
| G1 | Search input không có focus indicator nhìn thấy (storefront + shell header) | P2 | `:focus-visible=true` nhưng `outline: none` và không box-shadow thay thế. Người dùng bàn phím không biết mình đang ở ô search |
| G2 | ESC đóng drawer/modal → focus rơi về `body`, không restore về trigger | P2 | User-menu làm đúng (restore trigger) — drawer + confirm-modal chưa. Mất vị trí sau mỗi lần ESC |
| G3 | Không có skip-link ("tới nội dung chính") trên cả storefront lẫn shell | P2 | Tab đầu tiên là logo; nội dung chính nằm sau ~10+ stop header/nav |
| G4 | Storefront header link "Giỏ hàng"/"Tài khoản" hard-code `http://localhost:5173/...` | P2 | Trên rig này shell là `:5703` — Enter trên 2 link này dẫn sang port chết/khác môi trường. Flow chính không đi qua (dùng drawer shell + goto trực tiếp) nhưng là bom hẹn giờ khi đổi port |
| G5 | `POST /api/cart/merge` trả **400** khi login với guest-cart state (run 2–4; run 5 cart rỗng → 200) | P1 logic | Guest cart không merge được vào user cart sau login; items vẫn thêm được sau đó nên flow không chết, nhưng dữ liệu guest bị bỏ. Cần điều tra handler |
| G6 | Variant chip keyboard-flow **chưa kiểm chứng được** | Info | Cả 2 sản phẩm tìm thấy cho "xiaomi" đều single-variant, không có chip. Direction §3.4 (chip group Enter/Space) chưa đối chiếu được trên dữ liệu seed hiện tại |
| G7 | Checkout Stepper header: các step chưa tới là `button[disabled]`; ArrowRight chỉ di focus giữa dot hiện hữu, không nhảy bước | Info | Hành vi hợp lý (không cho nhảy qua step chưa hoàn tất) — ghi nhận đối chiếu direction §3.4 |
| G8 | Confirmation CTA text là "Tiếp tục mua sắm" (không có "Về trang chủ"); CTA về `localhost:3000` (canonical) thay vì origin hiện tại | Info | Hoạt động đúng chức năng; ghi nhận khác biệt text với kịch bản |

## 5. Fix-task proposals

| # | Surface | File (khả nghi / đã định vị) | Hành vi mong muốn | SF sở hữu (đề xuất) |
|---|---------|------------------------------|-------------------|---------------------|
| F1 (G1) | Ô tìm kiếm header — storefront + shell | `frontend/apps/storefront-web/components/SearchBar.tsx` (+ `app/app.css`); shell header search input (shell app, global css) | Thêm focus ring nhìn thấy được khi `:focus-visible` (outline hoặc box-shadow) | SF-2 storefront elevation |
| F2 (G2) | Drawer + confirm-modal focus restore | `frontend/packages/ui-kit/src/components/Drawer.tsx` (ui-kit) — modal cùng pattern | ESC/đóng overlay → focus về element trigger (user-menu `AuthWidget` là pattern tham chiếu) | SF-2 / ui-kit shared |
| F3 (G3) | Skip-link | storefront layout + shell layout | Thêm link "Tới nội dung chính" là Tab-stop đầu tiên | SF-2 storefront |
| F4 (G4) | Storefront header cart/account links | storefront header component (hard-code `localhost:5173`) | Đọc từ env/config shell URL thay vì hard-code | SF-2 / rig config |
| F5 (G5) | Cart merge API | client: `frontend/apps/mfe-checkout/src/lib/cartApi.ts`; server handler merge (cart service) | Merge guest-cart sau login không trả 400 (hoặc bỏ qua an toàn + log) | SF-3 checkout / cart service |
| F6 (G6) | Variant chip keyboard | PDP storefront (chưa gặp trên seed) | Bổ sung seed sản phẩm có variant để QA chip group Enter/Space theo direction §3.4 | SF-2 + seed data |

## 6. Phụ lục

- **Script:** `scripts/qa/keyboard-flow.mjs` (standalone, không thêm spec vào `frontend/e2e/tests/`). Kết quả JSON: `/tmp/keyboard-flow-results.json`.
- **Screenshots (18, bộ run cuối):** `docs/superpowers/qa/walkthrough/keyboard/01-home-focus-order.png` … `18-usermenu-after-esc.png` (home, login, PLP, PDP, drawer mở/ESC, cart + confirm modal, checkout 3 bước, review, after-place-order, confirmation, user-menu).
- **Đơn hàng tạo trong QA (mutator W3):** run 4 tạo 1 order qua path Stripe (POST `/api/ordering/orders → 201` nhưng không hoàn tất payment trong iframe — order sẽ pending/expired, minh bạch: do selector radio chưa dùng Arrow nên rơi vào Stripe); run 5 tạo **1 order COD hợp lệ** đến `/order/confirmation`. Tổng 2 order.
- **Lưu ý môi trường:** shell `:5703` chỉ bind IPv6 (`[::1]`) — `localhost` trong trình duyệt tự fallback, `127.0.0.1` sẽ fail (khớp memory port-semantics).
