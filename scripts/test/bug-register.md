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
| ENV-02 | P1 | env-infra | fresh worktree | `frontend/node_modules` không tồn tại → FE boot fail `Command turbo not found` (boot3 00:50). Mọi worktree mới phải `pnpm install` trước `make dev` | `.run/logs/frontend.log` (boot3) | Mitigated (pnpm install chạy; note trong dev-stack) |
| ENV-01 | P1 | env-infra | máy dev | Port squatting chéo worktree: cả 10 JVM port 8080-8092 giữ bởi jar **sf-13-essentials-polish** (họp từ 19:45 tối trước, story đã xong) + `sf6-keycloak` container chiếm 8082 + `ecommerce-postgres` Exited(255) sau daemon restart. `dev-stack` health-skip ("đã UP") tin listener KÌA → test nhầm code cũ | lsof cwd=…/sf-13-essentials-polish ×10 (00:35) | Mitigated (dọn + guard worktree-ownership trong start_jvm; sf6-keycloak stopped — `docker start sf6-keycloak` nếu cần) |

## Fixed trong story

| # | Sev | Loại | Bề mặt | Mô tả | Fix | Commit |
|---|-----|------|--------|-------|-----|--------|
| BUG-01 | P1 | product-bug | catalog-service | `application.yml` duplicate top-level key `catalog:` (SF-13 MinIO block dòng 48 + SF-15 internal-token block dòng 92) → snakeyaml `DuplicateKeyException` → **service không boot từ jar sạch** | Merge 2 block thành 1 (`internal-token` vào block `catalog:` đầu) | (điền khi commit) |
| FI-337-#2 | — | product-bug? | shell/mfe-account vite proxy | "Vite proxy nuốt Set-Cookie khi register/login" — **REPRO NEGATIVE trên GA**: login/refresh/logout xuyên :5173 + :5176 round-trip cookie chuẩn (Set-Cookie intact: Path=/api/identity, HttpOnly, SameSite=Lax); register 201 **không** Set-Cookie ở CẢ direct lẫn proxy = backend design (register ≠ auto-login). Proxy không nuốt gì | Không cần fix runtime; thêm regression lock: e2e assert cookie round-trip xuyên proxy | (điền khi commit) |

## Skips inventory — `[PENDING-STRIPE-KEYS]`

> Fill từ T4 (grep `hasStripe` — 5 file: playwright.config, golden-path, saga-fail, platform-asserts, helpers/env).

| Spec | Test | Điều kiện skip | Re-run khi keys |
|------|------|----------------|-----------------|

## Baseline report (run-batch)

> Fill sau T2: số test/pass/fail mỗi suite + log path.
