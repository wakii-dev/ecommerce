# SF-6 convergence-qa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bằng chứng TOÀN HỆ THỐNG đồng bộ sau khi SF-1..5 merge về `story/fi390-uiux-elevation` (tip 8d775b8): consistency sweep, dark-mode 4-trạng-thái contrast sweep (scripted), reduced-motion sweep, responsive 375/768, keyboard-only flow, i18n parity vi/en (0 hardcoded P1), e2e FULL 14 specs xanh, unit tests toàn monorepo xanh, CLS đo home+PDP (< 0.1), visual walkthrough record 5 surfaces. SF-6 là QA độc lập: KHÔNG tự sửa code surface — sweep-fail → fix-task về SF sở hữu (ngoại lệ duy nhất: e2e specs).

**Architecture:** Verify TRÊN code hợp nhất. Backend story-branch ≡ master (0 diff backend/contracts/services/infra — verified 2026-09-09) → tái sử dụng backend main-checkout :8080 đang sống; FE rig tự raise từ worktree này trên alt-ports (pattern SF-3/4/5: shell + REMOTE_*_URL, `.env` copy TRƯỚC boot — vite bake `VITE_*` lúc start).

**Tech Stack:** Playwright (frontend/e2e node_modules, pinned executablePath rig khi orca screenshot flaky), node scripts cho contrast/reduced-motion/responsive/CLS, grep/find+xargs cho static sweeps (BSD grep nhiều `--include` false-negative — dùng find -print0 | xargs -0), vitest monorepo. KHÔNG thêm dependency.

**Linear Issue:** FI-396 · **Worktree:** sf-6-convergence-qa · **Đích merge:** `story/fi390-uiux-elevation` (SF CUỐI — tự merge: parent vào sf-6 trước → update-ref FULL refname + 2 ancestor guards; conflict improvements-log giữ CẢ HAI; no-ff)

**Nguồn sự thật:** `docs/superpowers/contexts/fi390-sf-6.md` (spec slice + ACCEPTANCE + boundary) · bracket `docs/superpowers/brackets/fi390-uiux-elevation.md` §SF-6 (Merge sequence + sweep-fix loop cap 2 vòng) · design direction `fi390-uiux-elevation-direction.md` (brand lock #F53D2D, hướng B) · epic spec `2026-09-08-uiux-elevation-design.md` §4.7/§7.

---

## 0. Root cause analysis (WHY)

### Root cause
4 surface SF (SF-2 storefront / SF-3 shell+checkout / SF-4 account / SF-5 admin) + foundation SF-1 phát triển SONG SONG rồi merge tuần tự — chưa ai từng chạy đồng thời đủ lớp verification trên code HỢP NHẤT. Lịch sử (`sf1-qa-suite-recipe`): lần đầu chạy full-suite tổng lộ 7 product bug sống âm thầm. Convergence gate tồn tại vì merges cá nhân xanh ≠ hệ thống đồng bộ (selector drift, keyframes lạc chỗ, i18n key lệch nhau giữa SF, tint pill lệch giữa surfaces).

### Current state (before) — đã verify 2026-09-09
- Worktree sf-6-convergence-qa @ 8d775b8 (= tip nhánh đích), tree sạch.
- Backend main-checkout :8080 gateway UP (jars 19:46 hôm trước — backend identical 2 nhánh nên hợp lệ); seed sống: user@demo.vn/Demo#2026 login OK; infra docker đầy đủ (PG :5433, mailpit :8025, stripe-cli Up healthy).
- Stripe: payment service có STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET; stripe-cli whsec `whsec_f26132…` — 3-gates khớp (verify chi tiết T0).
- Ports free (probe): 3101 (storefront), 5703 (shell), 5705 (checkout), 5706 (account), 5707 (admin), 5708 (skeleton-remote). Ports bận: 3000/5173/5175-77 (main), 527x/537x (SF cũ, không đụng).
- e2e known-drifts từ memories: nav-honesty footer/category SPA-race + seed-order kỳ vọng sai với gateway thật (fix thuộc owner e2e = SF-6, pattern `waitForURL`/`toHaveURL`); WELCOME10 có thể bị toggle-off (restore POST toggle).

### Expected outcome
5 dòng ACCEPTANCE context pack (e2e 14 specs xanh 1 lệnh; 4 trạng thái theme consistent + contrast AA pass scripted; reduced-motion sạch + mobile 375 trơn; keyboard-only full flow; vi/en 0 hardcode P1 + CLS ghi nhận + walkthrough record trên epic).

### Constraints & hardships
- `contracts/**` READ-ONLY; zero backend change; KHÔNG sửa app/package code (fix surface → fix-task + comment epic gán SF sở hữu; re-run cap 2 vòng).
- KHÔNG merge vào main; KHÔNG re-design direction đã duyệt.
- Sweep-fail thuộc diện nhỏ được bracket cho phép (fix selector vỡ bằng data-testid fallback trong SPECS) → tự fix; code surface thật → REQUIREMENT-GAP lên FI-390.
- pnpm-lock freeze; e2e FULL cần stack sống — alt-ports per worktree.

### High-level strategy
Static-first (không cần rig): T1 consistency grep + T6 i18n grep + T8 unit monorepo chạy ngay → đồng thời boot FE rig (T0) → browser sweeps song song (T2 contrast script / T3+T4 responsive+reduced-motion / T5 keyboard flow / T7 e2e full) → T9 CLS → T10 walkthrough record (Rule 0, coordinator tự nhìn) → independent review (code-reviewer + verifier + security-audit trên artifacts) → merge + story-verify gate → Done. ExecutorParallel phải disjoint file ownership; commit serialize theo file-list (shared-worktree race).

## 1. Problem
Epic FI-390 claim "UI/UX elevation toàn hệ thống" — sau 5 merge, claim chưa có bằng chứng hợp nhất. Nếu convergence fail mà không gate, user nhận 5 mảnh đẹp nhưng hệ thống lệch nhau (màu/tint/keyframes/i18n/selector).

## 2. Scope
- **In:** 10 task bracket + T0 rig setup + T11 review/merge/gate. Artifacts: `docs/superpowers/qa/*.md` (reports), `scripts/qa/*` (contrast/CLS scripts), fixes trong `frontend/e2e/**` (selector/testid/spa-race), epic comments.
- **Out:** sửa app/package code; feature polish mới; backend/contracts; merge main.
- **Success criteria:** từng dòng ACCEPTANCE context pack + epic §7.1-13 (phần FE) — verify Phase 5 TỪNG DÒNG, không tick khi chưa thấy.

## 3. Touch map
**Create:** `docs/superpowers/qa/{consistency-sweep,dark-mode-contrast,reduced-motion,responsive-375-768,keyboard-flow,i18n-parity,e2e-full,unit-tests,cls-measure,walkthrough-record}.md` · `scripts/qa/{contrast-sweep.mjs,reduced-motion.mjs,responsive.mjs,keyboard-flow.mjs,cls-measure.mjs,i18n-parity.mjs}` (TẤT CẢ sweep scripts để `scripts/qa/` — KHÔNG thêm spec mới vào `frontend/e2e/tests/` giữ nguyên count 14 specs của T7) · walkthrough screenshots `docs/superpowers/qa/walkthrough/`.
**Modify (duy nhất được phép):** `frontend/e2e/tests/*.spec.ts` — fix selector vỡ (data-testid fallback ADR SF-1), SPA-race `waitForURL`/`toHaveURL`, seed-order kỳ vọng.
**READ-ONLY:** `frontend/apps/**`, `frontend/packages/**` (đọc để sweep), `contracts/**`, `backend/**`.
**Consumers/regression:** epic §7 mechanical criteria; next/link pattern store; token-regression test.

## 4. Design
- **Stack (Phase 0 direction A):** backend shared :8080 + FE rig từ worktree: storefront `next dev -p 3101` (GATEWAY_URL mặc định :8080); shell :5703 với đủ 4 REMOTE_*_URL (checkout 5705 / account 5706 / admin 5707 / skeleton-remote 5708 — filter name `@ecommerce/skeleton-remote`); 3 MFE `vite --port N --strictPort` (KHÔNG pipe head khi background); `.env` đã copy (sk/pk/whsec đều thật — hasStripe() true). e2e chạy với `E2E_STOREFRONT_URL=http://127.0.0.1:3101 E2E_SHELL_URL=http://localhost:5703` (helpers/env.ts hỗ trợ sẵn); GATEWAY_URL đọc từ .env (:8080).
- **Contrast sweep method (§4.7):** Playwright mở từng page định danh × 4 trạng thái theme (storefront light/dark qua `documentElement.dataset.theme`, admin light/dark qua `admin`/`admin-dark`), đọc computed styles (color, backgroundColor, fontSize, fontWeight) của text nodes chính (body text, muted, link, price, badge, pill, button) → tính WCAG 2.x contrast ratio; AA: ≥4.5 (text thường), ≥3.0 (≥24px hoặc ≥18.66px bold + UI components). Script in JSON + verdict per element; fail-list → fix-task.
- **Reduced-motion:** Playwright `page.emulateMedia({ reducedMotion: 'reduce' })` → probe computed `animation-duration`/`transition-duration` (expect ~0.01ms hoặc none) trên ken-burns hero, reveal section, shimmer skeleton, drawer/toast; content vẫn hiện đủ (hero tĩnh, skeleton màu tĩnh); verify cả Next (3101) lẫn Vite (5703/5705/5706/5707).
- **Keyboard-only:** Playwright `page.keyboard` duy nhất (không mouse): login → home → PDP thêm giỏ → drawer (ESC đóng/mở lại) → checkout 3 bước (stepper arrow-key) → confirmation; assert focus-visible (document.activeElement + computed outline), không focus-trap chết (Tab ra ngoài được overlay), focus order hợp lý.
- **i18n sweep:** (a) grep Vietnamese literals trong JSX render của 4 Vite apps + storefront components — P1 = 0 (scope `find -print0 | xargs -0 grep`, loại comment — bài học ThemeToggle "✓"); (b) key parity vi↔en: storefront COPY module + `@ecommerce/i18n` catalogs — script diff keysets 2 chiều; (c) aria-label keys.
- **e2e selector fixes:** chỉ specs — `waitForURL`/`toHaveURL` thay đọc URL tức thì; data-testid fallback khi classname surface đổi; CategoryTiles seed-order kỳ vọng → sửa theo gateway thật; giữ semantic classname (ADR).
- **Execution waves (plan-critic P0/P1 — cap 4 in-flight):** W1 = {T1, T6, T8} static (song song T0 boot) → W2 = {T2, T3, T4, T7} (T7 là mutator DUY NHẤT) → W3 = {T5} (sau T7 — T5↔T7 serialize vì cùng mutation shared DB: order tạo mới, WELCOME10 toggle, stock drain) → W4 = {T9} (rig yên sau read-only sweeps — CLS số sạch) → W5 = {T10} (sau T7 xanh + T9 — record trên hệ ĐÃ fix) → T11.
- **Sweep-fix re-run loop (cap 2 vòng):** mỗi sweep task T1-T8 khi fail → sinh fix-task = comment lên epic FI-390 (format: `[SF-6 sweep] <surface> — <file> — <hành vi sai> → gán SF-N sở hữu`). Vòng re-run N+1: TRƯỚC TIÊN merge `story/fi390-uiux-elevation` (hoặc cherry-pick fix commit) vào sf-6 worktree; fix CHƯA merge về nhánh đích → task BLOCKED-WAIT (không tick, không đếm vòng). Sau 2 vòng cùng fail → STOP + tổng hợp + hỏi coordinator (không tự sửa code surface).
- **Edge cases:** seed drift (WELCOME10 toggle-off → POST restore; stock drain trên SKU cụ thể → SQL scope `db_inventory` CHỈ row đó — KHÔNG `make seed` wipe-style vì DB dùng chung); next dev CLS noisy hơn prod → ghi nhận + note; shell body canvas/font cần check computed style 2 theme (SF-3 lesson); sessionStorage tab-scoped coupon (cùng tab đi flow).
- **Alternatives loại:** boot full isolated JVM stack (backend identical — chi phí không mua gì); orca screenshot làm primary (flaky khi window không visible — Playwright rig pinned `chromium_headless_shell-1234` làm chuẩn, orca browser chỉ để user xem cuối).

## 5. Implementation outline

### Task 0 — Rig boot + 3-gates verify (coordinator inline)
- [x] Copy `.env` từ main checkout (sk/pk/whsec present)
- [x] Probe ports free: 3101/5703/5705/5706/5707/5708
- [ ] So whsec .env ≡ stripe-cli whsec (docker logs) + payment env có STRIPE_SECRET thật
- [ ] Boot storefront :3101 (`pnpm --filter storefront-web exec next dev -p 3101`)
- [ ] Boot checkout :5705, account :5706, admin :5707 (`pnpm --filter <app> exec vite --port N --strictPort` — .env trước boot)
- [ ] Boot shell :5703 với REMOTE_CHECKOUT_URL/REMOTE_ACCOUNT_URL/REMOTE_ADMIN_URL/REMOTE_SKELETON_URL trỏ đúng
- [ ] Health probe: gateway/storefront/shell/mailpit preflight xanh; seed user + admin login OK; WELCOME10 active (restore nếu off)

### Task 1 — cross-surface-consistency-sweep (executor-A, static)
- [ ] Grep `@keyframes` toàn apps/ → chỉ đúng 4 file page.css + ui-kit.css (epic §7.3)
- [ ] Grep `prefers-reduced-motion` ≥ 1 hit toàn monorepo (epic §7.3)
- [ ] Grep `<a href="/` apps/storefront-web → 0 hit (next/link generated loại); SortSelect không còn `window.location.assign` (epic §7.4) — SCOPE: check `SortSelect.tsx` riêng; `AddToCart.tsx` buyNow `window.location.assign(shellUrl()/cart)` là jump cross-app CỐ Ý — judge + ghi chú, không false-fail
- [ ] `loading.tsx` + `error.tsx` tồn tại home/PLP/PDP/search; skeleton xuất hiện orders/wishlist/admin tables (epic §7.5 — check tồn tại file + grep Skeleton)
- [ ] Emoji-icon trong JSX string literal/runtime (ThemeToggle "✓" nằm COMMENT — scope grep đúng; CartBadge/ThemeToggle/UserMenu/Confirmation hero/Wishlist = 0 emoji — epic §7.6)
- [ ] Pill/badge tints: grep `--pill-*`/`--tint-*` usage nhất quán; hex trực tiếp ngoài var fallback → list (epic §7.9: .pay-warning/Newsletter/admin css 0 hex)
- [ ] Icon SVG: 1 nguồn Icon component (grep inline `<svg` ngoài Icon.tsx → list ngoại lệ)
- [ ] Report `docs/superpowers/qa/consistency-sweep.md` (pass/fail từng mục + evidence grep counts); fail → fix-task = comment epic FI-390 format `[SF-6 sweep] <surface> — <file> — <hành vi sai> → gán SF-N`

### Task 2 — dark-mode-4-state-contrast-sweep (executor-B, cần rig)
- [ ] Viết `scripts/qa/contrast-sweep.mjs` (method §4.7 ở mục 4)
- [ ] Matrix pages × 4 theme: home, PLP, PDP, cart, checkout 1-3, confirmation, account, orders, order-detail, admin dashboard/products/orders
- [ ] Chạy → JSON evidence + `docs/superpowers/qa/dark-mode-contrast.md` verdict AA per element; fail-list → fix-task

### Task 3 — reduced-motion-sweep (executor-C, cần rig)
- [ ] `scripts/qa/reduced-motion.mjs` — emulateMedia reduce; probe animation/transition durations + content-visible trên ken-burns/reveal/shimmer/drawer/toast, cả Next + Vite
- [ ] Hero auto-rotate DỪNG HẲN khi reduced-motion (direction §3.3 — không chỉ tắt animation, autoplay phải off; chỉ arrows/dots/pause)
- [ ] Report `docs/superpowers/qa/reduced-motion.md`; fail → fix-task comment epic (format như T1)

### Task 4 — responsive-375-768-sweep (executor-C, cần rig)
- [ ] Viewport 375 + 768 toàn surfaces: mobile nav, sticky ATC, grid 2-col, shell header wrap, checkout 1-col, account sidenav collapse, admin layout
- [ ] Assert: không horizontal scroll (`document.documentElement.scrollWidth <= innerWidth + 1`), elements không clip chết
- [ ] Report `docs/superpowers/qa/responsive-375-768.md` (+ screenshots bằng chứng)

### Task 5 — a11y-keyboard-only-flow (executor-D, cần rig, SAU T7 — serialize mutation shared DB)
- [ ] Keyboard-only SCRIPT (standalone `scripts/qa/keyboard-flow.mjs` — KHÔNG thêm spec vào tests/, giữ count 14): login → home → PDP (chọn variant) → thêm giỏ → drawer → checkout 3 bước → confirmation — không mouse
- [ ] Focus order + focus-visible + ESC overlay + Tab ra được overlay (không trap) + stepper/tabs arrow-key + user menu
- [ ] Report `docs/superpowers/qa/keyboard-flow.md` (bảng bước × phím × kết quả); fail → fix-task comment epic (format như T1)

### Task 6 — i18n-parity-sweep (executor-A, static)
- [ ] Grep hardcode tiếng Việt trong JSX render (P1 = 0) — find+xargs, loại comment + test fixtures
- [ ] Key parity vi↔en 2 hệ (storefront COPY + @ecommerce/i18n catalogs) — script diff 2 chiều → 0 lệch
- [ ] aria-label keys parity
- [ ] Report `docs/superpowers/qa/i18n-parity.md`

### Task 7 — e2e-full-suite-selector-fix-testid (executor-E, cần rig, mutator DUY NHẤT của W2)
- [ ] Chạy cả 14 specs (count giữ nguyên — T5 script nằm ngoài tests/): `E2E_STOREFRONT_URL=http://127.0.0.1:3101 E2E_SHELL_URL=http://localhost:5703 pnpm exec playwright test` (serial, retries 1)
- [ ] Fix trong specs: SPA-race `waitForURL`/`toHaveURL` (nav-honesty footer/category), seed-order CategoryTiles, selector vỡ → data-testid fallback
- [ ] Sweep-fail KHÔNG thuộc specs → fix-task về SF sở hữu (comment epic format như T1)
- [ ] Re-run tới xanh (cap 2 vòng): vòng re-run PHẢI merge `story/fi390-uiux-elevation` (hoặc cherry-pick fix commit) vào sf-6 trước; fix chưa merge → BLOCKED-WAIT không đếm vòng; evidence full output → `docs/superpowers/qa/e2e-full.md` + epic comment

### Task 8 — unit-tests-monorepo-token-regression (executor-A, static)
- [ ] vitest × các packages (ui-kit, i18n, shell, mfe-checkout, mfe-account, mfe-admin, storefront-web nếu có) — tất cả XANH
- [ ] token-regression test pass (tokens v2 nguyên vẹn sau 5 merge)
- [ ] pnpm-lock 0-diff (epic §7.10 — `git diff master..HEAD -- frontend/pnpm-lock.yaml` rỗng)
- [ ] Report `docs/superpowers/qa/unit-tests.md` (số test/file per package); FAIL → fix-task về SF sở hữu package đỏ + re-run cap 2 vòng (cùng cơ chế sweep + re-sync worktree)

### Task 9 — perf-cls-measure-font-skeleton (executor-F, cần rig YÊN — deps [T0, T2, T3, T4] xong, không chạy song song browser sweeps/e2e)
- [ ] `scripts/qa/cls-measure.mjs`: CLS + LCP home + PDP (Playwright PerformanceObserver qua CDP/web-vitals pattern) — ghi nhận số + note dev-mode
- [ ] Font check: computed font-family = Be Vietnam Pro trên 5 apps (eval computed style + screenshot)
- [ ] Report `docs/superpowers/qa/cls-measure.md` (baseline main nếu lấy được; không → ghi nhận-only + note); CLS ≥ 0.1 → KHÔNG tick target, ghi số thật + fail-list

### Task 10 — visual-walkthrough-record-signoff (coordinator, Rule 0, SAU T7 xanh + T9 — record trên hệ ĐÃ fix)
- [ ] Record/screenshots 5 surfaces (storefront home/PLP/PDP, shell+cart/checkout, account, admin) cả light/dark + mobile 375 — Playwright rig pinned executablePath; lưu `docs/superpowers/qa/walkthrough/`
- [ ] Shell header checklist ĐẦY ĐỦ (epic §7.8): logo + search + cart-badge + account menu (remote SF-4) — assert DOM + nhìn screenshot
- [ ] Guest drawer preview (epic §7.11 — guest + logged-in): visual + DOM assert
- [ ] COORDINATOR TỰ MỞ browser đi flow + NHÌN screenshots (không tin report agent)
- [ ] Epic comment: link artifacts + số liệu; chuẩn bị final verify STORY-COMPLETE

### Task 11 — Independent review + merge + gate (coordinator, deps [T1..T10])
- [ ] code-reviewer ĐỘC LẬP trên sweep scripts + reports + spec fixes → APPROVED
- [ ] security-audit trên scripts (nếu có input handling/fetch)
- [ ] verifier độc lập: từng dòng ACCEPTANCE context pack + epic §7 mechanical criteria (§7.3/7.4/7.5/7.8/7.10 nhắc lại)
- [ ] Merge: parent → sf-6 trước → `orca worktree update-ref refs/heads/story/fi390-uiux-elevation` FULL refname + 2 ancestor guards; conflict improvements-log giữ CẢ HAI; no-ff
- [ ] Post-merge smoke golden-path trên nhánh đích (bracket: smoke sau MỖI merge — merge của SF-6 cũng là merge)
- [ ] Audit comment merge-hash + `task-update task_e31f0d6d281a completed` + worktree comment "merged <hash>"
- [ ] GATE CỨNG `~/.claude/bin/story-verify sf-6` sạch → FI-396 Done (sau merge, trước Done)

## 6. Risks
- **e2e flaky tầng seed/stock:** drain → re-seed trước suite; WELCOME10 toggle restore.
- **next dev chậm cold-compile:** pre-warm các route trước sweep (curl từng page 1 lần).
- **Shared DB với session khác:** data mutation e2e (order tạo mới) là expected; không wipe DB người khác.
- **Sweep-fail phải escalate:** bracket cap 2 vòng — vòng 1 fix-task → re-run; vòng 2 vẫn fail → STOP + tổng hợp + hỏi coordinator (REQUIREMENT-GAP).
- **CLP/CLS measurement imperfection trên next dev:** ghi nhận + note minh bạch, không tick "target <0.1" nếu số không đạt — nói thật.
