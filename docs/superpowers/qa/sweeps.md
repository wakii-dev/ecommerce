# SF-5 sweeps — dep freeze + zero-backend + provenance (FI-402)

> Fork point so FI-390 story: `a9a8fad` · HEAD story branch: `be9962c` (SF-1..4 merged) · Chạy: 2026-09-09 (early — trước rig, kiến trúc rig dựa trên kết quả này).

## 1. pnpm-lock — 0 EXTERNAL dep mới (gate định nghĩa lại theo spec-critic P0)

`git diff a9a8fad..HEAD -- frontend/pnpm-lock.yaml`: **66 dòng thêm, 0 dòng xóa**.

- 6 importer blocks thêm `@ecommerce/chrome: specifier workspace:* / version link:../../packages/chrome` (shell, storefront-web, mfe-checkout, mfe-account, mfe-admin, skeleton-remote — từ merge SF-1).
- 1 importer block mới `packages/chrome` — deps chỉ gồm: workspace links (`@ecommerce/auth|i18n|ui-kit`) + package ĐÃ CÓ sẵn trong lock (react 18.3.1, react-dom, @testing-library/dom|react 10.4.1|16.3.3, @types/react 18.3.31, @types/react-dom 18.3.7, i18next 23.16.8…).
- **0 block `resolution:`/`engines:`/`hasBin` mới** → KHÔNG snapshot package external nào được thêm vào store.

**Verdict: PASS** — 0 external dep mới; dep freeze giữ nguyên (BroadcastChannel/Web Locks = Web API). Lưu ý: pack-literal "diff rỗng" KHÔNG đúng hiện trạng (SF-1 hợp lệ thêm workspace-link); gate chuẩn = như trên.

## 2. backend/ + contracts/ — zero functional change (deviation ghi tường minh)

`git diff a9a8fad..HEAD -- backend/ contracts/` → duy nhất `backend/gateway/src/main/resources/gateway-routes.yml` (9 dòng: 6+/3-).

So sánh non-comment (`grep -vE '^\s*#'` cả 2 phiên bản rồi diff): **EMPTY** — chỉ comment docs thay đổi (SF-3 `5e3d544`: cập nhật ghi chú dev-entry :3000 + ADR 0008; predicates/filters/uri nguyên trạng, comment trong file tự khẳng định "PREDICATE KHÔNG ĐỔI").

`infra/nginx/frontend-web.conf`: **EMPTY diff**. `docker-compose.yml` base: **EMPTY diff** (chỉ `docker-compose.override-sf2.yml` MỚI thêm từ SF-2 — file riêng, không sửa base).

**Verdict: PASS với deviation được ghi** — pack-literal "diff backend rỗng" vi phạm bởi comment-only docs; revert comment = sửa backend ngoài quyền SF-5 → deviation này được đưa epic FI-397 ratify TRƯỚC verify (comment audit SF-5).

## 3. Provenance backend rig A (chứng minh "evidence trên code nhánh đích")

- Main checkout `/Users/hoivu/orca/projects/ecommerce` HEAD = master `a2aba92` ("docs: FI-397 APPROVE remap linear IDs").
- `git diff a9a8fad..master -- backend/ contracts/` → **EMPTY** → trees backend của story-branch ≡ fork-point ≡ master.

⇒ Gateway/jars :8080 mà rig A dùng (boot từ main checkout) chạy code backend **tree-identical** với backend nhánh đích — claim "e2e/walkthrough evidence trên code nhánh đích" auditable.

## 4. Raw evidence (append cuối-run — Task 10)

- `git diff a9a8fad..HEAD -- frontend/pnpm-lock.yaml | grep -cE '^\+[^+]'` → 66
- `git diff a9a8fad..HEAD -- frontend/pnpm-lock.yaml | grep -E '^\+.*(resolution:|engines:|hasBin)' | wc -l` → 0
- `git diff a9a8fad..HEAD -- backend/ contracts/ --stat` → 1 file (gateway-routes.yml, 6+/3-)
- non-comment diff gateway-routes.yml → empty
- `git diff a9a8fad..master -- backend/ contracts/ --stat` → empty
