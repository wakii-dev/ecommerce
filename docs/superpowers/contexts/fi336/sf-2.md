# SF-2 Context Pack — images-release

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: docs/superpowers/specs/2026-09-06-github-actions-ci-dev-prod.md · Bracket: docs/superpowers/brackets/fi336-github-actions-ci-dev-prod.md
> Làm việc TRÊN NHÁNH story/fi336-github-actions-ci-dev-prod (fork từ master, ĐÃ chứa SF-1 — fork sau khi SF-1 merge về đích).

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)

1. **`backend/gateway/Dockerfile`** — copy pattern `backend/services/template-service/Dockerfile` (multi-stage: maven:3.9-eclipse-temurin-21 build IN-CONTAINER từ repo-root context, KHÔNG dùng maven host → release.yml không cần setup maven/pnpm — G13) → runtime `eclipse-temurin:21-jre`. **Gateway module ở `backend/gateway/`** (KHÔNG phải backend/services/). Port gateway = **8080**. Local build smoke trước khi commit: `docker build -f backend/gateway/Dockerfile .` chạy được.
2. **Workflow `release.yml`** — triggers: `push` master (dev path) + `push` tags `phase-*`/`v*` (prod path) + `workflow_dispatch` (G15). Concurrency RIÊNG (G11): group `release`, `cancel-in-progress: false` (queue — cancel làm mất image của SHA trước). Permissions: `packages: write` CHỈ cho jobs push GHCR.
3. **Matrix discovery (G12)**: script scan `**/Dockerfile` loại `node_modules/|target/|dist/|.git/` → JSON matrix qua GITHUB_OUTPUT. svc name = basename parent dir. **WARN baseline** = bảng tên→module mirror Makefile case table; loại `shared/*` (library không ship image); module baseline thiếu Dockerfile → WARN trong job summary (KHÔNG fail, KHÔNG im lặng).
4. **Dev path** [push master / dispatch env=dev]: build+push `ghcr.io/wakii-dev/ecommerce/<svc>:master-<sha>` (dispatch: tag `dispatch-<run_id>`). docker/buildx + login/metadata/build actions SHA-pinned; build cache `type=gha`.
5. **Prod path** [tag phase-*/v* / dispatch env=prod+tag_name]: job `environment: prod` (GH đòi approve — required reviewer owner) → build+push tag = tên tag đầy đủ. KHÔNG tag `latest`. **Phân biệt bằng chứng gate (agent-verifiable) vs phê duyệt (owner async):** agent chứng minh run xuất hiện + trạng thái "Approval required" + KHÔNG có prod images được build; owner approve là follow-up không chặn SF — **LƯU Ý: GitHub chặn self-approval** (actor trigger run không thể tự approve — nếu gh auth là token owner thì cần owner bấm tay hoặc reviewer thứ 2; KHÔNG tự cấu hình lại environment để né gate).
6. **GitHub Release** (G2 idempotent): tag đẩy lên mà release chưa có → `gh release create --draft --generate-notes`; ĐÃ có → edit notes (create-or-update, KHÔNG fail).
7. **Environments setup**: script idempotent `scripts/gh-setup-environments.sh` — create `dev` (không gate) + `prod` (required reviewers = owner). Chạy thật + read-back verify.
8. **GHCR visibility** (runbook task, ownership rõ): flip = cài đặt package GHCR — bước UI là của owner (API user-package không đáng tin) → task DONE khi: runbook có mục flip-public từng bước + xác minh `docker pull ghcr.io/wakii-dev/ecommerce/gateway:<tag>` KHÔNG LOGIN thành công (nếu owner chưa flip thì nửa này là yellow-gate chờ owner, KHÔNG tự đánh done). Note giữ nguyên: package trùng tên tồn tại sẵn → kế thừa settings cũ.
9. **Runbook** `docs/runbook-release.md` (2 task ghi vào chung file — chia SECTION ĐÁNH SỐ để không đè nhau: flip-public là section riêng, cleanup là section riêng): quy trình phase release MỚI — merge PR (human gate) → **tag trên master HEAD sau merge** → approve prod → images + Release draft. **BẮT BUỘC có mục "trạng thái theo ref" (plan-critic P1-4): tag chỉ sản xuất trên ref CHỨA release workflow; nhánh story FI-310 (không chứa release.yml) = silent no-op; ref khác chứa release.yml (vd nhánh story fi336) = prod-run thật có gate.** KHÔNG sao chép nguyên văn claim "story branch = silent no-op" không điều kiện.
10. **Makefile block append-only** (G9): target `image` build local 1 service (`make image svc=gateway`) — block RIÊNG có comment ownership, KHÔNG sửa block ai; KHÔNG đụng `make full` stub hay docker-compose.yml.
11. **Verify-first (task `verify-first-dispatch-demo-live-cleanup`, task cuối — chạy THẬT cả 3 path trên refs chứa release.yml):** (a) `workflow_dispatch env=dev` TRÊN NHÁNH STORY fi336 → images `dispatch-<run_id>` xuất hiện GHCR; (b) live auto-discovery demo: tạo `backend/services/demo-service/` + Dockerfile pattern trên nhánh test (khớp `story/**`) → dispatch env=dev TRÊN REF nhánh đó → matrix gồm demo-service + job summary WARN ~7 module baseline (expected trên nhánh fi336) + KHÔNG WARN demo-service — không sửa workflow; (c) tag test (vd `v0.0.0-ci`) **đẩy lên HEAD NHÁNH STORY fi336 — KHÔNG tag master trước merge** (ref duy nhất chứa release.yml trước merge; invariant G2 áp dụng cho master) → run xuất hiện → "Approval required" hiện + không prod images = BẰNG CHỨNG GATE; owner approve async (nếu được) → images versioned + draft; (d) **cleanup ĐẦY ĐỦ**: xóa tag test + draft release + images `dispatch-*` + nhánh demo-service test.

## Touch map (files SF-2 tạo/sở hữu)

```
backend/gateway/Dockerfile                  (mới — module backend/gateway, context repo root)
.github/workflows/release.yml               (mới — SF-2 sở hữu)
scripts/gh-setup-environments.sh            (mới)
scripts/list-dockerfiles.(sh|mjs)           (mới — discovery, test được local)
docs/runbook-release.md                     (mới)
Makefile                                    (sửa: append-only block `image` riêng)
README.md                                   (sửa NHỎ: link runbook từ section CI/CD của SF-1 — sau SF-1)
```

READ-ONLY: `docker-compose.yml` (append-only per-SF — KHÔNG đụng), `contracts/**`, `backend/**` (trừ Dockerfile gateway mới), `.github/workflows/ci.yml` + composite actions (SF-1 — chỉ ĐỌC, không sửa; conventions dùng chung), `make full` stub (SF-10).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Merge (hoặc dispatch env=dev) → vài phút sau `ghcr.io/wakii-dev/ecommerce/gateway:master-<sha>` + template-service tồn tại; sau flip public → `docker pull` anonymous OK (owner chưa flip = yellow-gate, ghi rõ).
2. Tag test trên HEAD nhánh story fi336 → run xuất hiện → trạng thái "Approval required" environment prod + KHÔNG prod images được build (= bằng chứng gate); owner approve async → images versioned + Release draft; tag re-push với release cũ → edit notes không fail. Cleanup: tag + draft + images test.
3. Live demo: `backend/services/demo-service/` + Dockerfile pattern trên nhánh test → dispatch env=dev TRÊN REF đó → run build nó KHÔNG sửa workflow; job summary WARN module baseline thiếu Dockerfile (identity...), KHÔNG WARN demo-service.
4. `make image svc=gateway` build được image local; `make full` vẫn là stub nguyên vẹn.
5. Runbook mô tả đủ quy trình mới (merge → tag master → approve → images + release) + mục "trạng thái theo ref" + flip-public từng bước — người chưa thấy pipeline đọc xong làm được.

## Boundary (KHÔNG làm — đụng tới = flag coordinator)

- ci.yml / composite actions / branch protection / mvnw → **SF-1** (đã merge trong base của SF-2)
- Sửa `docker-compose.yml`, wire `make full`, tạo prod compose/deploy files (SF-10 + G9)
- Sửa contracts/**, Dockerfile cho services chưa tồn tại (identity gap → flag FI-310, không tự thêm)
- Deploy server thật / SSH secrets / k8s (out-of-scope — G1)
- CodeQL / Dependabot / E2E (out-of-scope story)
