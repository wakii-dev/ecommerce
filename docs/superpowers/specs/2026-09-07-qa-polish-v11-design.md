# QA & Polish v1.1 — Epic Spec (Story Design)

> Date: 2026-09-07 · Status: REVISED (spec-critic REVISE applied — FI-337 delta thu hẹp, AdminApp→SF-2, stripe re-run T15, integration gate, disk gate, GATEWAY_URL 13 files) · Repo: `/Users/hoivu/orca/projects/ecommerce` · Base: master `40d801f` (GA v1)
> Pipeline: IDEA-BRIEF → P0 analyst (10 chiều, IMPACT-READY) → 2 clarifying (SF split = Direction B; Stripe keys = sẽ cung cấp) → spec này

---

## 1. IDEA-BRIEF (8 chiều)

| Chiều | Nội dung |
|---|---|
| **Task** | Stabilization & Polish post-GA: chạy LẦN ĐẦU full-suite tổng (87 Java + 36 FE + pytest + 11 E2E specs), hunt bugs toàn hệ thống, rà UI/theme so design direction A, fix toàn bộ bugs + lấp khoảng trống trong phạm vi đã design |
| **Output** | Full-suite xanh · bug register triệt tiêu · UI khớp direction A "Chợ Sôi Động" · golden path E2E verify ĐẦY ĐỦ (khi có Stripe keys) · master稳定 |
| **Users** | Dev team (test xanh tự tin) + end user (login/checkout không lỗi — đặc biệt auth cookie) |
| **Constraints** | MUST: bugfix + polish KHÔNG feature mới · `contracts/**` READ-ONLY · giữ parameterized `hasStripe()` (keys đến giữa story phải flip hoạt động) · 2 SF song song KHÔNG đồng thời dùng `make dev` fullstack (single-session conflict đã biết) |
| **Input** | Codebase GA (15 SF) · known-gaps: FI-337 (refresh race + proxy Set-Cookie) · seed V11 thiếu limit/expiry + stock không repair · env drift GATEWAY_URL 5+ file · dev-stack token TTL 15' · FE polish nợ (i18n admin, confirm deletes, numeric guard) · design direction A file |
| **Context** | Vừa GA xong — agents rảnh, codebase fresh · Docker daemon UP · disk 3.7G+ (đã dọn 11G pnpm store) |
| **Success** | Full suite xanh (Java + FE + pytest + E2E) · golden path E2E FULL verify (khi có keys) · FI-337 đóng · không còn bug P0/P1 open · UI pass walkthrough vs direction |
| **Out-of-scope** | Feature mới · refactor auth flow (chỉ fix race, không restructure) · perf optimization sản phẩm · contracts changes |

## 2. Quyết định (decision log)

| # | Quyết định | Nguồn |
|---|---|---|
| E1 | **2 SF Direction B**: SF-1 backend+E2E (run→fix→green, own auth-flow + dev-stack + seed) · SF-2 frontend polish (run→fix→polish, own ui-kit/theme/i18n) — song song, file sets rời nhau | **USER** (chọn qua AskUserQuestion) |
| E2 | **Stripe keys do user cung cấp trong story** — thiết kế: mỗi SF có task "stripe-enabled re-run" gated trên `hasStripe()`; keys vào `.env` bất cứ lúc nào → flip chạy lại, không hard-code skip | **USER** |
| E3 | **Auth-flow giao thoa về SF-1**: Set-Cookie vite proxy fix (file FE nhưng đúng chất auth-flow) + FI-337 FE-side (AuthStore/AdminApp) thuộc SF-1 — ranh giới ghi rõ chống miss-giao-thoa | AGENT (P0 khuyến nghị mitigate risk Direction B) |
| E4 | **Dev-stack ownership + cơ chế verify SF-2**: SF-1 own `make dev` start/stop lifecycle (chạy suốt, long-lived); SF-2 là **consumer** của stack đang chạy (GATEWAY_URL → stack SF-1) + `make dev-fe app=<name>` cho app mình — KHÔNG tự start/stop fullstack (tránh xung đột single-session). Browser-verify SF-2 = navigate trang thật do stack phục vụ | AGENT (mitigate P0 risk Direction B) |
| E5 | **Flyway V11 immutable** — fix coupon seed phải V12-migration (xin number) hoặc seed.sh UPSERT-only sau khi verify checksum volume dev | AGENT (P0 data-dim) |
| E6 | **UI audit = diff-vs-spec** — chuẩn so `fi310-storefront-direction.md` §1-3 (tokens/pill/behavior), không đánh giá chủ quan; dark mode tự đặt tiêu chí contrast (ngoài design doc gốc) | AGENT (P0) |
| E7 | **Audit-driven gaps (feature-parity audit 2026-09-07)**: (a) **Admin coupons CRUD THIẾU backend** — spec §4.2 hứa nhưng chỉ có GET /coupons/public → contracts amendment (coordinator-approved, như A1) + AdminCouponController (SF-1) + FE form (SF-2); (b) **RBAC inventory hở** — gateway admin-prefixes thiếu `/api/inventory/admin/**` + inventory không có service guard (SF-1 fix); (c) gateway admin guard thiếu `/api/catalog/admin/**` (SF-1 fix, defense-in-depth); (d) home "Xem thêm" dead link (SF-2 fix). FI-337 ĐÃ FIXED sẵn (đóng evidence-based) | AGENT (audit findings) |

## 3. Kiến trúc thay đổi

KHÔNG đổi kiến trúc — mọi fix nằm trong seam có sẵn. **FI-337 current-state (đã verify trên code GA): backend `rotate()` ĐÃ atomic (`revokeIfActive`), AuthStore ĐÃ single-flight, AdminApp boot-race ĐÃ fix từ GA → delta còn lại CHỈ là vite proxy Set-Cookie + regression tests; KHÔNG cần DB migration (schema đã có `revoked_at`):**
- `shell/vite.config.ts` + `mfe-account/vite.config.ts` (Set-Cookie proxy repro/fix — SF-1) + regression test + cookie e2e assert
- `scripts/seed/seed.sh` + migration **V12** (coupon limit/expiry + stock repair — SF-1, sau checksum verify; V12 free vì ordering đang V11, chạy đúng cả volume dev cũ lẫn compose fresh)
- **GATEWAY_URL single-source: 13 file thật** (4 vite configs mfe-account/shell/mfe-checkout/mfe-admin — storefront-web là Next không có vite config; `storefront-web/lib/catalog-api.ts` + `lib/reviews-api.ts` + `middleware.ts` + `coupons/page.tsx` + `tests/wiring.test.ts`; `scripts/render-smoke.mjs`; `e2e/helpers/env.ts`; `scripts/dev-stack.sh`; `next.config.mjs`) — cơ chế: giữ `.env` làm nguồn duy nhất, FE đọc `import.meta.env`, Next server-side đọc `process.env`; fix = thay hardcode `:8080` fallback bằng env-bắt-buộc + 1 documented default (SF-1)
- `scripts/dev-stack.sh` (token TTL mint lại + single-session guard — SF-1)
- `packages/ui-kit/src/styles/tokens.css` + 5 apps pages (theme/i18n/guards — SF-2; `AdminApp.tsx` trọn vẹn thuộc SF-2)
- `scripts/test/` (suite runner scripts mới — SF-1, không sửa code product)

## 4. Feature scope (đóng băng)

**SF-1 backend-e2e-stabilize (15 tasks):**
1. Chuẩn hóa suite runner: `scripts/test/` — `mvn -q test` reactor từ `backend/` (+ `-am`/repackage-trap ghi chú) · `pnpm -r test` qua turbo · pytest `.venv` · E2E serial
2. **Run-batch toàn bộ suite** (Java ×11 service + FE 36 file + pytest invoice) → log vào **bug register** (P0/P1/P2 + phân loại env-infra/product-bug/flaky; flaky retry 1 lần rồi register; P1 > 15 → coordinator tách follow-up) — **living document `scripts/test/bug-register.md`, sync sau T-audit**
3. Preflight hạ tầng: `make dev` fullstack **1 session (SF-1 own start/stop)** · `make seed` ×2 idempotency · record GATEWAY_URL/port · **dev-stack token TTL re-mint + single-session guard**
4. E2E tổng không-keys → inventory chính xác các skip `[PENDING-STRIPE-KEYS]`
5. Browser walkthrough storefront (home/PLP/PDP/cart) so direction §1-3 → diff list
6. Browser walkthrough shell/checkout/account + admin so direction §2.6 → diff list
7. **Audit sweep** (theme tokens 3 theme + contrast dark · a11y focus-visible · i18n key missing · hardcoded string 5 apps · secrets grep · `infra/keys` double-entry · rbac spot-check) → register
8. **FI-337 residual**: Set-Cookie qua vite proxy repro + fix (`shell/vite.config.ts` + `mfe-account/vite.config.ts`) + regression test + cookie e2e assert (backend rotate/AuthStore/AdminApp ĐÃ fix từ GA — KHÔNG đụng)
9. **RBAC fixes**: gateway admin-prefixes thêm `/api/inventory/admin/**` + `/api/catalog/admin/**` + inventory-service Spring Security guard tối giản
10. **AdminCouponController** (ordering): POST/PUT/DELETE /admin/coupons theo contracts amendment A2 (%, fixed, window, usage limit) + validation
11. **GATEWAY_URL single-source 13 files** (list §3) + `make full` sanity re-run sau fix
12. **Seed/coupon data repair**: verify checksum V11 volume dev → V12 migration (coupon limit/expiry) hoặc seed.sh UPSERT-only; stock repair `DO UPDATE` giữ idempotent — chạy đúng cả volume cũ lẫn compose fresh
13. **Bug register tổng hợp cuối** (P0/P1/P2 + baseline report) — hand-off SF-2 (coordinator relay)
14. **Stripe-enabled re-run** (per T4 inventory; điều kiện keys `.env`; hết story chưa có → PENDING documented): restart stack nhặt `.env` → chạy các test skip; FAIL stripe-branch → fix + chạy lại
15. Security re-sweep + update `docs/superpowers/improvements-log.md` (đánh dấu mục đã xử lý)

**SF-2 frontend-polish-theme (13 tasks):**
1. Tokens diff vs direction §1 — fix values (không đổi tên biến)
2. Dark mode polish theo contrast criteria
3. Storefront header + home so §2.1-2.2 (sticky/search/mini-nav/countdown)
4. Product-card + PLP + PDP so §2.3-2.5 (badge tint §1.6, price-block, variants, tabs)
5. **`AdminApp.tsx` trọn vẹn thuộc SF-2** (AdminShell sidebar/topbar + theme swap — FI-337 boot-race đã fix từ GA, SF-1 KHÔNG đụng file này)
6. Behavior §3: hover-lift .12s, focus-visible, Price VND qua primitive
7. i18n: `admin.common.from/to` vi/en, OrderDetailPage `useT`, scan từ bug register SF-1 (living — sync sau T10/T11)
8. UX guards: confirm deletes, productForm numeric "1e999", empty/error states
9. Responsive ≤900px: header wrap, mini-nav scroll-x, admin sidebar
10. FE unit tests vỡ fix + token-regression test nhỏ
11. Browser walkthrough sau-fix — **day-1 rig preflight**: chứng minh 1 trang round-trip FE-local (`make dev-fe app=<name>`, GATEWAY_URL → stack SF-1) TRƯỚC khi polish (cross-worktree MF host/remote chưa từng chứng minh) + screenshot record (KHÔNG chạy E2E — SF-1 own)
12. Hand-off notes cho SF-1 T13 (stripe re-run)
13. Cấm thêm dep FE mới nếu không note coordinator; nếu có → re-run `pnpm install` lúc merge (pnpm-lock đã verify: turbo test có sẵn, risk ≈ 0)
13. **Coupons admin form** (read-only page → CRUD): form tạo/sửa coupon (%, fixed, window, usage limit) gọi AdminCouponController (amendment A2) + confirm delete
14. Home "Xem thêm" dead link fix → href đúng route featured

**SF-1 phụ thuộc SF-2 output? KHÔNG** — 2 SF song song, giao nhau duy nhất là bug register (SF-1 T12 output → SF-2 T7 input) → thực tế SF-1 T12 chạy SỚM (giữa SF-1, không phải cuối) để SF-2 có register sớm.

## 5. Success criteria

1. Full Java suite xanh (reactor `mvn -q test`, bao gồm cả bài học `*IT` naming/repackage)
2. Full FE suite xanh (36 file) + pytest xanh
3. E2E không-keys: toàn bộ test không-skip XANH; golden path assert tới tạo đơn + saga-fail
4. **Có Stripe keys**: golden path FULL (CONFIRMED + email Mailpit + badge verified) — re-run 1 lần
5. FI-337 đóng (race fix + regression test + cookie e2e assert)
6. Bug register P0/P1 = 0 open; P2 documented backlog
7. UI walkthrough pass vs direction (storefront + admin, đủ 5 màn)
8. Dark mode contrast pass; i18n key missing = 0; hardcoded string scan = 0 finding P1
9. Secrets grep sạch; rbac e2e vẫn xanh
10. **Audit-driven (E7)**: admin tạo/sửa/xóa coupon qua UI thành công (lưu DB, hiện coupon center); customer JWT gọi `/api/inventory/admin/low-stock` → 403; home "Xem thêm" điều hướng đúng

## 6. SF split + deps (2 SF song song từ đầu)

| SF | Tên | Tier | Depends | Tasks |
|---|---|---|---|---|
| SF-1 | backend-e2e-stabilize | 0 | — | 15 (như §4) — own: backend/**, scripts/**, e2e/**, 2 vite configs Set-Cookie, dev-stack lifecycle |
| SF-2 | frontend-polish-theme | 0 | — | 13 (như §4) — own: ui-kit tokens, 5 apps pages/theme/i18n/guards, KHÔNG fullstack (consumer stack SF-1) |

Register = **living document** tại `scripts/test/bug-register.md` trên branch SF-1; **coordinator relay deltas** cho SF-2 qua task message sau early-register (T2) và sau audit sweep (T7-T9). **Integration gate (coordinator-owned, sau khi CẢ 2 SF merged — merge order: SF-1 trước → SF-2 rebase → gate)**: full Java + FE + pytest + E2E + `pnpm install` (nếu deps đổi) + **disk pre-check (≥20G)** chạy 1 lần trên nhánh `story/fi310-qa-polish` — checklist **ĐẦY ĐỦ §5.1-10** (gồm UI-level verify bởi coordinator browser) — §5.1-3 chỉ tính đạt sau gate (chống 'mỗi SF xanh riêng nhưng nhánh đích chưa từng verify tổng').

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Full-suite lần đầu — số failure vô danh | SF-1 T1-T6 chạy trước khi hứa budget; bug register P0-P2 |
| R2 | FI-337 chưa repro | SF-1 T14: repro trước fix (đọc Linear + repro script) |
| R3 | Stripe keys timing bất định | E2 giữ `hasStripe()` flip; SF-1 có task re-run khi keys đến |
| R4 | Flyway checksum V11 | E5: verify checksum trước, V12-vs-seed quyết sau |
| R5 | GATEWAY_URL fix chạm 6 file → vỡ make full | SF-1 T-harness fix 1 nguồn rồi re-run make full sanity |
| R6 | Dev-stack xung đột 2 SF | E4: SF-1 own lifecycle; SF-2 không fullstack |
| R7 | UI fix drift khỏi direction | E6: chỉ fix diff-vs-spec, tokens-only |
| R8 | ENOSPC tái diễn (disk đã full 2 lần) | Pre-clean 11G pnpm + monitor; mvn verify chạy 1 SF lúc 1 chỗ khi có thể |

## 8. Assumptions

- User sẽ cung cấp Stripe test keys **trong story** (E2) — không keys thì golden-path full assert PENDING documented
- FI-337 chi tiết đọc từ Linear trước fix
- Dark mode không có spec gốc → tiêu chí contrast tự đặt (WCAG AA text)
- Branch base: `master` (GA) — 2 SF fork từ master, merge về `story/fi310-qa-polish` (nhánh đích mới, tạo lúc APPROVE)
