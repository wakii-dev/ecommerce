# SF-1 Context Pack — ci-pipeline

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: docs/superpowers/specs/2026-09-06-github-actions-ci-dev-prod.md · Bracket: docs/superpowers/brackets/fi336-github-actions-ci-dev-prod.md
> Làm việc TRÊN NHÁNH story/fi336-github-actions-ci-dev-prod (fork từ master).

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)

1. **Workflow `ci.yml`** — triggers (G5): `pull_request` → master + `push` trên [`master`, `story/**`, `wakii-dev/sf-**`]. Concurrency: group per-ref, cancel-in-progress: true. Top-level `permissions: contents: read` (giảm dần per-job).
2. **Job `changes`** (paths-filter): outputs `backend` / `frontend` / `contracts` / `workflows`. Filters: backend = `backend/**`, frontend = `frontend/**`, contracts = `contracts/**`, workflows = `.github/**`. Job-level conditionals cho jobs dưới (skipped = thỏa required check).
3. **Job `workflow-lint`**: actionlint (SHA-pinned) trên toàn bộ `.github/workflows/` — chạy LUÔN.
4. **Job `contracts`** [contracts]: spectral lint qua `pnpm dlx @stoplight/spectral-cli@<exact-version>` (G14 — literal pinned, KHÔNG tạo file dưới contracts/), flags `--fail-severity=error` (warns KHÔNG chặn — specs FROZEN).
5. **Job `backend`** [backend]: step 1 `docker info` gate (fail nếu daemon không trả lời) → `backend/mvnw -B verify` full reactor (Maven wrapper do task 1 thêm; setup-java cache: maven keyed `backend/**/pom.xml`) → **zero-test guard PER-MODULE (G17)**: module nào có `src/test/java` phải cho ≥1 `<testcase>` trong `**/target/surefire-reports` của module đó; tổng reports = 0 → fail (bẫy `disabledWithoutDocker=true` + surefire skip `*IT` im lặng).
6. **Job `frontend`** [frontend]: setup Node 22 + pnpm@10.19.0 (corepack đọc `packageManager` từ `frontend/package.json`; fallback G16 = `pnpm/action-setup` SHA-pinned nếu corepack fail) → `pnpm install --frozen-lockfile` (working-directory frontend) → **gen-drift check**: `pnpm gen` → `git diff --exit-code` (bảo vệ contracts freeze) → `pnpm turbo build test lint`. KHÔNG cài Playwright browsers.
7. **Composite actions** `.github/actions/setup-backend` + `setup-frontend`: wrap các setup steps trên, dùng chung trong ci.yml (SF-2 KHÔNG dùng — G13).
8. **Fail artifacts**: upload surefire reports + vitest output CHỈ khi job fail (`if: failure()`).
9. **Branch protection** (G3 + plan-critic P0-1, classic API — KHÔNG rulesets): required contexts CHÍNH XÁC = job ids `changes`, `workflow-lint`, `contracts`, `backend`, `frontend`. Job id PHẢI = check name (cấm `name:` display khác id). Script idempotent `scripts/gh-setup-branch-protection.sh`. **QUAN TRỌNG — enable sequencing: master phải chứa `ci.yml` trước khi bật vĩnh viễn, nếu không mọi PR đứng "Expected" vĩnh viễn (`gh pr update-branch` cũng vô dụng trước merge). Quy trình trong story: (1) viết script; (2) CỬA SỔ TOGGLE — bật → demo ACCEPTANCE 3 (PR đỏ bị chặn → fix xanh merge được) → TẮT lại; precondition cửa sổ: `gh pr list` xác nhận KHÔNG có phase PR FI-310 đang chờ; (3) BẬT VĨNH VIỄN = story-close step (SAU khi story PR merge — master lúc đó có `ci.yml`) + `gh pr update-branch` mọi PR mở.**
10. **Verify-first (task `verify-first-ci-runs-probe`, CHẠY TRƯỚC task protection)**: workflow chỉ tồn tại trên ref chứa nó — push nhánh test (tên phải khớp trigger `story/**` hoặc `wakii-dev/sf-**` — nhánh không khớp = không run, triệu chứng "không thấy run") lên origin để run THẬT chạy, chứng minh ACCEPTANCE 1, 2- phần skipped-jobs, 7 trước khi DONE. Không tự kết luận "hẳn chạy" khi chưa thấy run.
11. **Runner assumptions (G16)**: ubuntu-latest có Docker daemon. Corepack primary; fallback `pnpm/action-setup` SHA-pinned nếu corepack fail lần đầu.
12. **Exit criteria `maven-wrapper-add`**: `backend/mvnw -v -B` chạy thành công + `backend/.mvn/wrapper/maven-wrapper.jar` đã commit (không bị .gitignore chặn).

## Touch map (files SF-1 tạo/sở hữu)

```
.github/workflows/ci.yml                    (mới — SF-1 sở hữu)
.github/actions/setup-backend/action.yml    (mới)
.github/actions/setup-frontend/action.yml   (mới)
backend/mvnw + backend/.mvn/**              (mới — Maven wrapper, ngang hàng parent pom; .gitignore ĐÃ whitelist maven-wrapper.jar — không cần sửa .gitignore)
scripts/gh-setup-branch-protection.sh       (mới)
README.md                                   (sửa: badge + section CI/CD — CONFLICT RỦI với FI-310 phase-2, giữ edit nhỏ có delimiter rõ)
```

READ-ONLY: `docker-compose.yml`, `contracts/**`, `frontend/**`, `backend/**` (trừ mvnw), Makefile (Makefile `image` target là SF-2), `docs/superpowers/**`.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Push commit sửa backend lên nhánh story test → Actions run: `changes` + `workflow-lint` + `backend` chạy; `contracts`/`frontend` skipped.
2. Chỉ sửa docs → chỉ `changes` + `workflow-lint` chạy.
3. PR test vào master với backend fail → check `backend` đỏ → nút merge disabled; fix → xanh → merge được — demo TRONG CỬA SỔ TOGGLE (bật → chứng minh → tắt; bật vĩnh viễn = story-close sau merge). PR test xong ĐÓNG.
4. CI không xanh-ảo: break `docker-java.properties` trên nhánh probe khớp `wakii-dev/sf-ci-probe` → IT fail đỏ (quan sát rồi xóa nhánh); zero-test guard per-module grep được trong workflow.
5. `actionlint` sạch; mọi third-party action pin by SHA (`@<40-hex>`); trong cửa sổ toggle `gh api .../branches/master/protection` trả đúng 5 required contexts.

## Boundary (KHÔNG làm — đụng tới = flag coordinator)

- release.yml / Dockerfile / GHCR / environments / tag → **SF-2**
- Sửa `docker-compose.yml`, `contracts/**`, content backend/frontend (trừ thêm mvnw wrapper files)
- Makefile (SF-2 thêm block `image` riêng — append-only)
- E2E/Playwright, CodeQL, Dependabot (out-of-scope story — boundary section 5 của spec)
- Secrets thật (Stripe/JWT) — không cần, không thêm
- Đổi quy ước test naming `*Test` hay harness Testcontainers — chỉ BAO QUÁT, không sửa
