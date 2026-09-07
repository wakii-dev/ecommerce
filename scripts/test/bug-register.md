# Bug Register — FI-366 QA & Polish v1.1 (living document)

> SF-1 own · sync sau mỗi run-batch + audit sweep. Phân loại: `env-infra` (môi trường/máy) · `product-bug` (code thật) · `flaky` (retry 1 lần vẫn fail → register) · `polish` (UI/diff-vs-direction, relay SF-2).
> Severity: **P0** (chặn golden path / bảo mật / data-loss) · **P1** (feature chính sai, phải fix trong story) · **P2** (backlog documented).
> Log suite: `.run/test-logs/` (gitignored — path tham chiếu trong bảng).

## How to re-run

```bash
bash scripts/test/run-java.sh     # Java ×11 module (reactor)
bash scripts/test/run-fe.sh       # FE unit (turbo --force)
bash scripts/test/run-pytest.sh   # invoice pytest (.venv)
bash scripts/test/run-e2e.sh      # Playwright serial — CẦN make dev đang chạy
```

## Open bugs

| # | Sev | Loại | Bề mặt | Mô tả | Repro/evidence | Trạng thái |
|---|-----|------|--------|-------|----------------|------------|
| ENV-03 | P2 | env-infra | run-pytest runner | Venv mới dựng thiếu `pypdf` → 2/7 pytest fail `ModuleNotFoundError` (venv cũ của session trước có sẵn nên chưa từng lộ). Fix: runner cài đủ list khớp pyproject deps + [dev] | `.run/test-logs/pytest-20260908-005821.log` | FIXED (7/7 pass sau install) |
| FLAKY-01 | P2 | flaky | catalog IT ES container | `ElasticsearchContainer` 8.17.4 startup timeout khi chạy ĐỒNG THỜI với suite khác (Java batch + E2E batch song song — CPU contention): RelatedTest fail 83s, EsIndexerSearchTest fail 150s trong batch; **pass 53s khi chạy đơn**. Chưa phải product bug. Mitigation: KHÔNG chạy 2 suite nặng song song (documented trong runners + spec R8) | `.run/test-logs/java-20260908-005758.log` vs run đơn 01:10 rc=0, 01:15 7/7+3/3 | Documented |
| ENV-02 | P1 | env-infra | fresh worktree | `frontend/node_modules` không tồn tại → FE boot fail `Command turbo not found` (boot3 00:50). Mọi worktree mới phải `pnpm install` trước `make dev` | `.run/logs/frontend.log` (boot3) | Mitigated (pnpm install chạy; note trong dev-stack) |
| ENV-01 | P1 | env-infra | máy dev | Port squatting chéo worktree: cả 10 JVM port 8080-8092 giữ bởi jar **sf-13-essentials-polish** (họp từ 19:45 tối trước, story đã xong) + `sf6-keycloak` container chiếm 8082 + `ecommerce-postgres` Exited(255) sau daemon restart. `dev-stack` health-skip ("đã UP") tin listener KÌA → test nhầm code cũ | lsof cwd=…/sf-13-essentials-polish ×10 (00:35) | Mitigated (dọn + guard worktree-ownership trong start_jvm; sf6-keycloak stopped — `docker start sf6-keycloak` nếu cần) |

## Fixed trong story

| # | Sev | Loại | Bề mặt | Mô tả | Fix | Commit |
|---|-----|------|--------|-------|-----|--------|
| BUG-03 | P1 | product-bug | gateway storefront route | Predicate storefront-web thiếu `/vi,/vi/**` → mọi localized link qua gateway :8080 ăn 404 Whitelabel (language switcher link `/en/` hoạt động nhưng `/vi` 404; middleware locale routes dùng `/vi/**`). E2E không bắt được vì `STOREFRONT` env đi thẳng `:3000` | curl :8080/vi → 404 Whitelabel (01:22); /vi trực tiếp :3000 = 200 | FIXED — predicate thêm `/vi,/vi/**` (commit BUG-03); verify /vi,/en,/vi/c/*,/vi/search = 200 |
| BUG-04 | P2 | product-bug | shell i18n runtime | Shell render RAW i18n key `nav.home` ở header (aria-label) + Home h1 — key ĐÃ tồn tại trong catalogs (`vi.nav.home='Trang chủ'`, test i18n pass) → nghi vấn MF shared-singleton: instance i18n của shell chưa init/instance khác remote | snapshot :5173 (01:2x): `banner "nav.home"` — t('nav.home') trả key | OPEN → **relay SF-2** (T7 i18n sweep) |
| POLISH-01 | P2 | polish | Price VND | Giá shell/admin thiếu khoảng trắng trước ₫ ("390.000₫", "3.771.000₫") — direction §3: "format VND `1.290.000 ₫` (dấu chấm ngăn nghìn, khoảng trắng trước ₫)"; storefront-web ĐÚNG ("390.000 ₫") | snapshot cart/admin KPI | OPEN → **relay SF-2** (§3 Price qua primitive) |
| POLISH-02 | P2 | polish | admin low-stock heading | Text dính "(tồn thấp)LIVE" — thiếu space giữa label + badge LIVE | snapshot admin dashboard | OPEN → **relay SF-2** |
| POLISH-03 | P2 | polish | i18n admin.common.from/to | Keys `from`/`to` thiếu trong CẢ vi + en catalogs (admin.common chỉ có create/edit/delete/...) | grep catalogs (01:4x) | OPEN → **relay SF-2** (T7, known gap) |
| POLISH-04 | P2 | polish | OrderDetailPage i18n | 0 match `useT` — hardcoded string chưa translát (known gap) | grep 01:4x | OPEN → **relay SF-2** (T7) |
| A11Y-01 | P2 | polish | focus-visible | `:focus-visible` chỉ có trên `.uk-btn`/`.uk-input` (ui-kit.css) — direction §3 yêu cầu global outline `2px --c-primary`; các element ngoài uk-* (links, chips, tabs) chưa thấy coverage | grep ui-kit styles (01:4x) | OPEN → **relay SF-2** verify + extend |
| BUG-07 | P1 | product-bug | docker image builds (make full) | CẢ 12 Dockerfile per-service chỉ COPY pom/src của mình — parent pom khai báo TẤT CẢ modules (SF-11..15 append sau SF-10) → mvn reactor vỡ "Child module does not exist" → `make full` CHẾT âm thầm từ sau SF-10, không ai biết (không CI build-smoke) | `COPY backend/ .` + cache-mount .m2 + `.dockerignore` + `-Dmaven.test.skip=true` (pattern dev-stack; `-DskipTests` vẫn compile test → dính SagaTest cross-module jar ~/.m2) | d9e294c |
| BUG-06 | P1 | product-bug (test) | PartnerWebhookTest | helper `publish()` đặt payload.orderId = field `orderId` CỦA TEST (đã ref ở @BeforeEach) — test "orderNotFromPartner" publish đơn ĐÃ ref rồi expect 0 delivery = không test gì + fail; cộng verify(0) TOÀN CỤC dính retry (5s/10s backoff) của test 500 chạy trước | publish raw envelope payload.orderId = UUID lạ (ref-miss THẬT) + scope assert theo orderId | 2abd182 |
| BUG-05 | P1 | product-bug (test) | PartnerOrderTest | IdentityClient cache token (AtomicReference trong app context chung) — test self-heal để lại 'tok-new' (TTL 900s) → test khác assert 'Bearer svc-token' fail deterministic theo method order | @BeforeEach expire cache (reflection helper có sẵn) → login fresh mỗi test | 2abd182 |
| BUG-02 | P1 | product-bug | catalog IT ↔ dev ES | IT catalog boot full context KHÔNG override `elasticsearch.uri` (vd ModerationAggregateTest) → default `localhost:9200` = **ES THẬT của dev stack** → EsEngine active → StartupReindexRunner wipe index dev + bulk fixture IT vào. Hậu quả: search storefront mất seed products (ES 14 docs vs DB 54) → 5 E2E fail (golden-path search, cod-checkout uniqlo, related-products, review-flow, §5.9) | `AbstractIntegrationTest` @TestPropertySource thêm `elasticsearch.uri=` (PgFts no-op cho mọi IT; RelatedTest/EsIndexerSearchTest vẫn override container riêng — verify 2 chiều: Moderation 2/2 + ES không đổi, ES-tests 10/10 + count 14 giữ nguyên). Dev index khôi phục: restart catalog → reindex 56 docs | FIXED (cea8cae) |
| BUG-01 | P1 | product-bug | catalog-service | `application.yml` duplicate top-level key `catalog:` (SF-13 MinIO block dòng 48 + SF-15 internal-token block dòng 92) → snakeyaml `DuplicateKeyException` → **service không boot từ jar sạch** | Merge 2 block thành 1 (`internal-token` vào block `catalog:` đầu) | bd5a188 |
| FI-337-#2 | — | product-bug? | shell/mfe-account vite proxy | "Vite proxy nuốt Set-Cookie khi register/login" — **REPRO NEGATIVE trên GA**: login/refresh/logout xuyên :5173 + :5176 round-trip cookie chuẩn (Set-Cookie intact: Path=/api/identity, HttpOnly, SameSite=Lax); register 201 **không** Set-Cookie ở CẢ direct lẫn proxy = backend design (register ≠ auto-login). Proxy không nuốt gì | Không cần fix runtime; thêm regression lock auth-cookie.spec 4/4 (rotate + replay-401 + logout-clear) | 11d851d |

## Skips inventory — `[PENDING-STRIPE-KEYS]`

> Fill từ T4 (grep `hasStripe` — 5 file: playwright.config, golden-path, saga-fail, platform-asserts, helpers/env).

| Spec | Test | Điều kiện skip | Re-run khi keys |
|------|------|----------------|-----------------|
| golden-path.spec.ts:191 | 6 — Mailpit email cảm ơn + attach PDF | `test.skip(!STRIPE_READY)` — CONFIRMED/email cần payment thật | T13 stripe re-run (restart stack với .env keys thật) |
| golden-path.spec.ts:200 | 7 — admin thấy đơn CONFIRMED trong admin orders | `test.skip(!STRIPE_READY)` — cần đơn CONFIRMED | cùng trên |
| saga-fail.spec.ts:59 | payment fail → FAILED... (branch) | KHÔNG skip — parameterized: không keys chạy payment_unconfigured path (declined-card branch chỉ khi keys) | branch stripe-mode tự flip qua `hasStripe()` |
| platform-asserts.spec.ts:130 | §5.14 affiliate commission | annotation-only [PENDING-STRIPE-KEYS] (cần order.confirmed) | không skip test — assert mở rộng khi keys |

> `hasStripe()` (helpers/env.ts): secret + publishable ĐỀU thật (không placeholder `xxx$`, prefix `sk_test_`). .env hiện tại: placeholder → 2 test skip thật (khớp evidence e2e 01:19: "2 skipped").

## P2 backlog (từ code-review FI-367 — không chặn merge)

| # | Nội dung | Nơi |
|---|----------|-----|
| BK-01 | InventoryJwtDecoderConfig copy ~130 dòng catalog JwtDecoderConfig — 2 bản security bắt đầu lệch; hoist lên common-lib | backend/services/inventory-service/config |
| BK-02 | adminCreate check-then-insert: 2 create song song cùng code → 1 về 500 thay vì 409 | ordering CouponService:129 |
| BK-03 | seed.sh `'$NAMEX'` interpolate thẳng SQL — name chứa `'` vỡ statement (pre-existing) | scripts/seed/seed.sh:189 |
| BK-04 | .dockerignore thiếu frontend/, infra/, contracts/ — context upload thừa (chậm, không sai) | .dockerignore |
| BK-05 | auth-cookie COOKIE_ATTRS regex dựa thứ tự attrs Playwright — identity đổi thứ tự cookie → false alarm; nên headersArray() | frontend/e2e/tests/auth-cookie.spec.ts:16 |
| BK-06 | re-mint restart_consumer dùng jar pre-built — sửa code không rebuild → jar cũ im lặng; log mtime jar | scripts/dev-stack-re-mint.sh |
| BK-07 | run-java aggregate đếm stale surefire txt từ run cũ (mvn test không clean) | scripts/test/run-java.sh |
| BK-08 | inventory reservations permitAll (ordering saga gọi không auth) — internal-token như precedent SF-15 catalog | ordering InventoryClient + inventory SecurityConfig |

## Baseline report (run-batch)

> **KẾT QUẢ CUỐI (03:04, HEAD cuối story) — toàn bộ XANH:**
> - Java: **368/368 (0 fail / 0 error / 0 skip), exit=0** — `.run/test-logs/java-20260908-025333.log` (run sạch duy nhất đủ điều kiện ACCEPTANCE 1; các batch trước = chẩn đoán)
> - E2E: **36 pass / 2 skip [PENDING-STRIPE-KEYS] / 0 fail, exit=0** — `.run/test-logs/e2e-20260908-030407.log`
> - FE: **12/12 turbo XANH** — `.run/test-logs/fe-20260908-025259.log` · pytest **7/7** — `.run/test-logs/pytest-20260908-025317.log`
>
> Lịch sử chẩn đoán: batch 1 (00:58, chạy SONG SONG E2E — vi FLAKY-01) 143 pass/2 ES-timeout · batch 2 (01:31) dừng partner BUG-05/06 → 45/45 solo · batch 3 (02:18) dừng ordering (T10 JWKS + T11 mid-flight race) → fix 89adcd9 → 44/44 solo · ENV-04 Docker daemon half-death 02:13 (identity 39 errors, recovery 10') · batch CUỐI (02:53) 368/368 XANH.> ENV-04 (mới): Docker daemon half-death giữa suite (API 500, containers=0) — identity 39 errors "no valid Docker"; recovery: restart Docker Desktop + compose up + restart gateway/FE (turbo chết theo outage). 5-10' downtime, volume giữ nguyên.
> FE: **12/12 XANH** (lần 1 + lần cuối 02:52) · pytest **7/7 XANH** (02:53).
> E2E cuối (02:48): 34 pass / 2 fail (COD+saga kẹt /checkout) — root cause restart tay ordering với token rỗng (fix: re-mint loop ghi token file) → re-run 2 spec PASS → **36/36 non-stripe XANH, 2 skip [PENDING-STRIPE-KEYS]**. RBAC e2e 7/7 · auth-cookie 4/4.
> FE (00:58): **12/12 turbo tasks XANH** — `.run/test-logs/fe-20260908-005758.log`
> pytest: **7/7 XANH** (sau ENV-03 fix) — `.run/test-logs/pytest-20260908-005952.log`
> E2E lần 1 (01:00): 11 fail = playwright browser thiếu (env) → install chromium. Lần 2 (01:01): 19 pass / 2 fail / 5 did-not-run — root cause BUG-02 (ES index wiped). Sau BUG-02 fix + reindex 56 docs: re-run 6 spec fail → **15 pass / 2 skip [PENDING-STRIPE-KEYS] / 0 fail** (01:19).

## Walkthrough record (T5-T8 — 01:20-01:45, orca browser snapshot)

> Screenshot PNG FAIL (Orca window không foreground — CDP capture timeout ×3) → theo recipe memory: đi flow bằng snapshot + eval + console; evidence = snapshot text trong log này. Diff so direction `fi310-storefront-direction.md`:

| Màn | Route | Kết quả vs direction |
|-----|-------|---------------------|
| Home | :8080/vi | ✓ header wordmark+ticker §2.1 · search bar · mini-nav · hero 3 slide + arrows/dots §2.2.1 · flash countdown hh:mm:ss + card -25% §2.2.2 · VND "749.000 ₫" ĐÚNG §3 |
| PLP | :8080/vi/c/dien-tu | ✓ breadcrumb · h1 uppercase + count §2.4 · sidebar cây danh mục (parent/child) |
| PDP | :8080/vi/p/ao-thun-nam-uniqlo-dry-ex | ✓ gallery tabs · price 390.000 ₫ · chips M/L/XL · qty stepper (− disabled ở 1) · CTA 2 nút · tabs §2.5 |
| Cart (click THÊM VÀO GIỎ thật) | :5173/cart | ✓ item xuất hiện, badge "Giỏ hàng — 1" · POLISH-01 giá thiếu space ₫ |
| Login → account | :5173/login | ✓ login → redirect Tài khoản, session persist (FI-337 UI-level OK) · BUG-04 raw nav.home |
| RBAC UI | :5173/admin (user) | ✓ customer bị chặn "Không có quyền" — message rõ |
| Admin dashboard | :5173/admin (admin) | ✓ sidebar 11 mục §2.6 · KPI 4 card · 2 SVG chart · low-stock LIVE · POLISH-01/02 |

**Console**: sạch (chỉ React DevTools info).
