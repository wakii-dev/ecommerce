# Spec — GitHub Actions: CI + dev + prod cho ecommerce platform

> Pipeline: IDEA-BRIEF → phase0-impact-analyst (10 dims) → clarifying (4 decisions USER) → spec
> P0 report: IMPACT-READY — ~6 files new/modified + 4 GitHub repo settings; top risks: silent-skip IT, PR-vs-push trigger mismatch, public supply chain.

## 1. IDEA-BRIEF (8 chiều)

| Chiều | Nội dung |
|---|---|
| **Task** | "Setup GitHub Action cho CI, dev, prod" → cụ thể: (1) **CI** — checks tự động (lint contracts + build/test backend Maven + build/test/lint frontend turbo) trên PR vào master VÀ trên push nhánh story/SF; (2) **dev** — merge vào master → build + push Docker images mỗi service lên GHCR tag `master-<sha>`; (3) **prod** — push tag `phase-*`/`v*` → build images versioned qua environment `prod` (required reviewer) + GitHub Release draft tự sinh notes |
| **Output** | 3 workflow files + 2 composite actions + gateway Dockerfile + 3 setup scripts + docs — sản phẩm nhìn thấy được: PR/push hiện checks xanh-đỏ; ghcr.io/wakii-dev/ecommerce có images; tag mới → environment gate + Release |
| **Users** | Owner (anh Vũ) duyệt prod deploy + merge phase PRs; SF agents (FI-310, 13 SF còn lại) nhận feedback CI trên push nhánh của mình |
| **Constraints** | MUST: auto-discovery (service mới có Dockerfile tự vào pipeline, không sửa workflow); KHÔNG block flow FI-310 (SF merge worktree trực tiếp vào story branch — không ép qua PR); human gate merge giữ nguyên (CI chỉ thêm 1 lớp verify trước gate); không wire `make full`/docker-compose (SF-10 + append-only per-SF). MUST-NOT: deploy server thật, secrets thật (Stripe không cần — degraded OK) |
| **Input** | Repo hiện trạng: origin/master cee0748 (214 files — SF-1+2), story branch 348 files (SF-3/5 merged, SF-4 đang chạy). GitHub: public repo, Actions enabled, 0 environments, 0 rulesets. Quyết định FI-310 liên quan: D12 (compose deploy model), D23 (release per phase, tag `phase-N`, merge = human gate) |
| **Context** | FI-310 đang giữa chừng (P2 sắp release) — story này ĐỘC LẬP, fork từ master, merge về master qua PR riêng. CI/CD từng là out-of-scope tường minh của FI-310 (spec line 19) — story này lấp chỗ trống |
| **Success criteria** | (1) PR lên master hiện required checks, đỏ = không merge được; (2) push story branch → checks chạy theo path-filter; (3) merge master → images `master-<sha>` trên GHCR cho MỌI service có Dockerfile; (4) push tag `phase-N` → prod environment đòi approve → images versioned + GitHub Release draft; (5) thêm service mới + Dockerfile → pipeline nhặt tự động (không sửa workflow); (6) CI không bao giờ xanh-ảo: docker gate + fail khi surefire 0 test |
| **Out-of-scope** | Deploy VPS/server thật (story sau khi có server — env `dev`/`prod` dựng sẵn để mở rộng); CodeQL/Dependabot/secret-scanning tuning (follow-up đề xuất); E2E Playwright (SF-10); `make full` runtime + compose profile (SF-10); sửa docker-compose.yml; secrets thật (Stripe keys); Python invoice CI (khi service xuất hiện — discovery tự report, thêm build backend khi cần) |

## 2. Decision log

| # | Quyết định | Nguồn |
|---|---|---|
| **G1** | **Deploy target = images-only → GHCR** (`ghcr.io/wakii-dev/ecommerce/<svc>`). Environments `dev` (auto) + `prod` (required reviewer) dựng SẴN làm cổng mở rộng — khi có VPS chỉ thêm deploy job. Không SSH, không server assumption | **USER** (4 options, chọn recommended) |
| **G2** | **Prod trigger = push tag `phase-*` / `v*`** → versioned images + environment `prod` gate + GitHub Release draft (create-or-update, idempotent). **Nghi thức release: tag cắt trên master HEAD SAU khi phase PR merge** — GitHub chạy workflow file TỪ tagged commit, nên tag chỉ sản xuất trên ref CHỨA `release.yml` (thực tế: master sau khi story này merge; các nhánh story FI-310 không chứa release.yml nên tag trên đó = silent no-op — đúng nghĩa gốc). Trái lại, tag trên ref CÓ release.yml (vd nhánh story của CHÍNH story này khi verify) = prod-path run THẬT có gate bảo vệ. Evidence: `phase-1` (d1fc5d0) là ancestor của master — practice đã tag master-side | **USER** + spec-critic P0-1 + plan-critic P0-3 |
| **G3** | **Branch protection master: required CI checks trên PR** (không restrict push trực tiếp). Classic API (KHÔNG rulesets). Required contexts = job ids: `changes`, `workflow-lint`, `contracts`, `backend`, `frontend` — job id = check name (cấm `name:` khác id). Skipped-job = thỏa required. **Enable sequencing (plan-critic P0-1): master phải chứa `ci.yml` TRƯỚC khi bật, nếu không mọi PR (kể cả update-branch) đứng "Expected" vĩnh viễn → quy trình: (1) SF-1 viết script + DEMO trong cửa sổ toggle (bật → demo PR đỏ-bị-chặn → TẮT lại); (2) BẬT VĨNH VIỄN là story-close step SAU khi story PR merge vào master; (3) ngay sau khi bật lần cuối: `gh pr update-branch` cho mọi PR mở (lúc này hiệu quả vì master đã có ci.yml) + precondition `gh pr list` kiểm tra không có phase PR đang chờ trong cửa sổ demo** | **USER** + spec-critic P0-2 + plan-critic P0-1/P1-3 |
| **G4** | **Dockerfile: auto-discovery** (workflow scan `**/Dockerfile` → matrix) + story này thêm **`backend/gateway/Dockerfile`** (đường dẫn thật của gateway module — KHÔNG phải `backend/services/`; pattern copy từ template, build context = repo root). Identity v.v. đến qua phase merges của FI-310 (SF-5 đã có inventory/payment; identity gap → flag FI-310 coordinator) | **USER** + P0 Alt 4-A + spec-critic P1-3 |
| **G5** | **CI triggers = `pull_request`→master + `push` (master, `story/**`, `wakii-dev/sf-**`)** — phản ánh flow thật: SF merges là worktree merges trực tiếp, KHÔNG PR (P0 dim 3.9). Concurrency cancel-in-progress per-ref; path-filter job-level (skipped = thỏa required) | **AGENT** (P0) |
| **G6** | **Chống xanh-ảo**: bước `docker info` gate trước backend verify + fail nếu surefire reports tổng = 0 test (bẫy `disabledWithoutDocker=true` + `*IT` skip im lặng). Quy ước `*Test` giữ nguyên | **AGENT** (P0 risk 1) |
| **G7** | **Public-repo supply chain**: chỉ `pull_request` (KHÔNG `pull_request_target`), third-party actions pin by SHA, `permissions:` tối thiểu per-job (`packages: write` chỉ job push GHCR), 0 secrets trong PR jobs | **AGENT** (P0 dim 3.4) |
| **G8** | **Spectral = `--fail-severity=error`** — warns không chặn (contracts FROZEN per FI-310 ownership rule (e); sửa warns = amendment task, không phải việc CI). Thêm **codegen-drift check** (`pnpm gen` → `git diff --exit-code`) bảo vệ freeze | **AGENT** (P0 dim 3.3) |
| **G9** | **KHÔNG đụng `make full` / docker-compose.yml / contracts/**: image build không sở hữu trước compose wiring (SF-10). Makefile chỉ thêm append-only block riêng (target `image` build local). Prod compose/deploy file = KHÔNG tạo trong story này (ranh giới SF-10 sạch) | **AGENT** (P0 risk 6) |
| **G10** | **CI story fork từ master, merge về master qua PR riêng** — độc lập FI-310. Conflict tiềm năng chỉ README/.gitignore. **Ràng buộc thứ tự duy nhất: story này merge master TRƯỚC lần tag `phase-*` tự động hóa đầu tiên** (P0-1: tag-push chạy workflow từ tagged commit — tagged commit phải chứa `release.yml`) | **AGENT** + spec-critic P0-1 |
| **G11** | **release.yml concurrency riêng: `group: release`, `cancel-in-progress: false`** — 2 merge master sát nhau → run sau CHỜ (queue), không cancel: cancel làm mất image `master-<sha>` của SHA trước | spec-critic P1-7 |
| **G12** | **Matrix discovery contract**: (a) svc name = **basename của parent dir** chứa Dockerfile (template-service → `template-service`, gateway → `gateway`); (b) exclusions khi scan: `node_modules/`, `target/`, `dist/`, `.git/`; Dockerfile ngoài backend (tương lai) vẫn được build generic — không muốn build → thêm 1 dòng vào exclusion list của script; (c) **WARN baseline** = bảng tên→module mirror Makefile case table (map `identity`→`services/identity-service`...), loại `shared/*` (library không ship image); module trong baseline thiếu Dockerfile → WARN trong job summary | spec-critic P1-4 |
| **G13** | **Image build IN-CONTAINER** per template multi-stage pattern (repo-root context, `mvn package` bên trong container) → release.yml KHÔNG cần maven/pnpm setup — chỉ checkout + docker login GHCR. SF-2 không tái sử dụng composite actions của SF-1 (dùng chung = conventions + check-name registry, không phải code) | spec-critic P1-11 |
| **G14** | **Spectral pinned**: `pnpm dlx @stoplight/spectral-cli@<exact-version>` (literal trong workflow, chọn bản ổn định lúc execute). **Cấm tạo/sửa file dưới `contracts/`** (không thêm package.json để "pin dep") | spec-critic P1-8 |
| **G15** | **workflow_dispatch** input: `env` enum `[dev, prod]`; `dev` → build+push tag `dispatch-<run_id>` (không qua environment); `prod` → bắt buộc input `tag_name` → build+push versioned QUA environment `prod` (approval vẫn yêu cầu — là feature). Đây là tool dry-run/test của SF-2 | spec-critic P1-9 |
| **G16** | **Runner assumptions tường minh**: ubuntu-latest có Docker daemon (nền cho G6); corepack là primary setup pnpm — **fallback được phép: `pnpm/action-setup` (SHA-pinned) đọc `packageManager`** nếu corepack fail lần chạy đầu (ghi comment trong workflow) | spec-critic P1-12 |
| **G17** | **0-test guard PER-MODULE**: module nào có `src/test/java` phải cho ≥1 `<testcase>` trong surefire-reports của module đó; tổng reports = 0 (Docker chết) → fail. Bẫy nhắm: 1 module im lặng 0 test trong khi reactor tổng > 0 | spec-critic P1-6 |

## 3. Kiến trúc pipeline

```
push (story/**, wakii-dev/sf-**, master) ──▶ ci.yml
pull_request → master                    ──▶ ci.yml   [required checks chặn merge]
   ├─ changes (paths-filter: backend/frontend/contracts/workflows)
   ├─ workflow-lint (actionlint — luôn chạy)
   ├─ contracts (spectral --fail-severity=error)          [contracts changed]
   ├─ backend (docker-info gate → mvnw verify → 0-test guard → fail-artifacts)  [backend changed]
   └─ frontend (setup pnpm → gen-drift check → turbo build/test/lint)  [frontend changed]

push master   ──▶ release.yml → matrix discovery → build+push GHCR :master-<sha>          (env: dev)
push phase-*  ──▶ release.yml → matrix discovery → [environment: prod → approve] →        (env: prod)
push v*                       ──▶ build+push GHCR :phase-N / :v-semver + GitHub Release draft
workflow_dispatch (input env) ──▶ chạy 1 trong 2 path trên (dry-run tool)
```

- **Composite actions** `.github/actions/setup-backend|setup-frontend` — dùng chung trong ci.yml (chống duplicate setup logic). release.yml KHÔNG dùng (G13: build in-container).
- **Discovery** (release.yml): theo contract G12 — scan + exclusions + WARN baseline từ Makefile case table. Python service sau này: Dockerfile python → tự nhặt (docker build generic).
- **Images**: `ghcr.io/wakii-dev/ecommerce/<tên-svc>:<tag>`. Dev: `master-<sha>`. Prod: tên tag đầy đủ (`phase-N`, `vX.Y.Z`). KHÔNG tag `latest` (hoãn đến khi có server deploy thật).
- **Release idempotency**: GitHub Release = create-or-update — tồn tại draft cho tag → edit notes thay vì fail (G2).
- **GHCR visibility**: lần push đầu package = private mặc định → runbook có bước flip public (UI) và **verify bằng `docker pull` anonymous** (không login). Repo public + images public = free unlimited; private = quota 500MB/1GB transfer — sẽ nghẹt với 12+ services. Runbook note: nếu package trùng tên tồn tại SẴN từ trước → lần push đầu kế thừa settings cũ.
- **Maven**: thêm `mvnw` wrapper tại **`backend/mvnw`** (ngang hàng parent pom; .gitignore đã whitelist maven-wrapper.jar). `cache: maven` keyed `backend/**/pom.xml`.
- **Frontend**: Node 22 + corepack pnpm@10.19.0 (đọc `packageManager` từ `frontend/package.json`; fallback G16), `--frozen-lockfile`, turbo build/test/lint. KHÔNG cài Playwright browsers (chưa có E2E — SF-10).

## 4. ACCEPTANCE (user-visible, binary)

1. Push 1 commit sửa backend lên nhánh story test → tab Actions hiện run: `changes` + `workflow-lint` chạy, `backend` chạy, `contracts`/`frontend` skipped. Chỉ sửa docs → chỉ `changes` + `workflow-lint` chạy, còn lại skipped.
2. PR test vào master với backend test fail → check `backend` đỏ → merge bị chặn (nút merge disabled) — demo trong CỬA SỔ TOGGLE của G3 (bật → chứng minh đỏ-bị-chặn → TẮT; bật vĩnh viễn là story-close step sau khi master có `ci.yml`). Fix → xanh → merge được. PR test xong → đóng.
3. Push 1 commit lên nhánh khớp `story/**` → CI chạy và hiện kết quả trên commit (SF agents thấy feedback không cần PR).
4. Merge vào master (HOẶC `workflow_dispatch env=dev` — G15) → trong ~vài phút `ghcr.io/wakii-dev/ecommerce/gateway:master-<sha>` (và template-service) tồn tại; sau khi flip public (runbook), `docker pull` anonymous thành công.
5. Tag test đẩy lên **HEAD nhánh story fi336** (ref chứa `release.yml` TRƯỚC merge — G2 ref rule; KHÔNG tag master trước merge) → run xuất hiện → trạng thái **"Approval required"** environment prod hiện VÀ không prod images nào được build (= bằng chứng gate, agent-verifiable); owner approve là follow-up ASYNC không chặn SF (LƯU Ý: GitHub chặn self-approval — actor trigger không tự approve được) → images versioned + draft release; release đã tồn tại cho tag → edit thay vì fail. **Cleanup**: xóa tag test + draft release + images `dispatch-*` test.
6. Live auto-discovery demo (nửa binary cần run thật): tạo `backend/services/demo-service/` + Dockerfile theo pattern trên nhánh test → `workflow_dispatch env=dev` TRÊN REF nhánh đó → matrix gồm demo-service; job summary WARN các module baseline thiếu Dockerfile (expected ~7 module trên nhánh fi336 — chính xác theo thiết kế) và KHÔNG WARN demo-service — không sửa bất kỳ workflow file nào. Cleanup: xóa nhánh test + images test.
7. Chứng minh IT chạy thật, không skip im lặng: trên nhánh probe khớp `wakii-dev/sf-ci-probe` (push trigger), break `docker-java.properties` → IT fail đỏ; quan sát → xóa nhánh. Surefire 0-test guard PER-MODULE (G17) tồn tại trong workflow (grep được step).
8. `actionlint` sạch trên toàn bộ `.github/`; mọi third-party action pin by SHA (grep `@<40-hex>`).
9. Branch protection master (classic, KHÔNG rulesets): script tạo đúng cấu hình — required contexts = [`changes`, `workflow-lint`, `contracts`, `backend`, `frontend`]; kiểm chứng bằng `gh api .../branches/master/protection` TRONG cửa sổ toggle; bật vĩnh viễn ở story-close + `gh pr update-branch` mọi PR mở ngay sau đó (G3 sequencing).
10. README có badge + section CI/CD: bảng "branch type → what runs"; `docs/runbook-release.md` mô tả đủ quy trình phase release MỚI: merge PR (human gate) → tag master HEAD → approve prod → images + Release draft — và GHCR flip-public step.

## 5. Boundary — KHÔNG làm

- VPS/server deploy thật, SSH secrets, k8s/helm (ADR migration path sau)
- CodeQL, Dependabot, secret-scanning tuning, renovate (follow-up đề xuất sau story — 1 comment Linear)
- E2E Playwright trên CI (SF-10 sở hữu E2E; khi đó thêm job + cache browsers)
- Sửa `docker-compose.yml`, wire `make full`, prod compose files (SF-10 + G9)
- Sửa contracts/*.yaml, packages/contracts (FROZEN — FI-310 rule (e)); **cấm TẠO file mới dưới `contracts/`** (G14 — pin spectral qua `pnpm dlx` trong workflow, không thêm package.json)
- Secrets thật (Stripe) vào CI; JWT keys (harness tự sinh — đã verify `AbstractIntegrationTest.writeKeys()`)
- Python build job riêng cho invoice-service (khi SF thêm service: discovery nhặt Dockerfile — đủ; thêm pytest job = follow-up nhỏ)

## 6. Rủi ro & mitigation (từ P0, đã qua decision)

| # | Rủi ro | Mitigation |
|---|---|---|
| R1 | CI xanh-ảo (IT skip khi Docker chết / `*IT` naming skip) | G6: docker-info gate + 0-test fail guard (ACCEPTANCE 7) |
| R2 | CI không thấy công việc hằng ngày nếu chỉ trigger PR | G5: push triggers story/** + wakii-dev/sf-** |
| R3 | Supply chain public repo | G7: pull_request-only, SHA-pin, min permissions |
| R4 | docker-java api.version drift trên runner | CI chính là detector; docs quy ước copy `docker-java.properties` per service (SF template đã có) |
| R5 | Phase-tag ≠ master HEAD semantics gây nhầm images prod | Runbook ghi rõ: tag = source of truth (G2) |
| R6 | GHCR private mặc định nghẹt quota | Runbook flip public ngay lần push đầu (ACCEPTANCE 4) |
| R7 | Workflow YAML lỗi syntax → silent no-run | Verify-first: chạy thật qua push/PR trước khi DONE (ACCEPTANCE 1) + actionlint job |
| R8 | mvn verify 10-20' × mỗi SF push → queue | paths-filter + concurrency cancel-in-progress; chấp nhận (repo public free) |
| R9 | Identity-service (story branch) chưa có Dockerfile → P2 release thiếu image | Flag FI-310 coordinator (comment epic FI-310); discovery WARN hiển thị gap |
| R10 | NEXT_PUBLIC_* env cần cho storefront build khi SF-4 merge | Workflows chấp nhận `vars`/`env` injection; verify khi P2 gần release (follow-up comment) |

## 7. Sub-features & DAG

| SF | Tên | Tier | Deps | ~Tasks | Đầu ra |
|---|---|---|---|---|---|
| SF-1 | ci-pipeline | 0 | — | 13 | ci.yml + composite actions + mvnw + protection + CI docs |
| SF-2 | images-release | 1 | SF-1 | 12 | gateway Dockerfile + discovery + release.yml + environments + runbook |

**Anti-duplicate audit** (liệt kê tasks mọi SF trước khi chốt): SF-1 sở hữu composite setup actions + CI conventions; SF-2 KHÔNG tái sử dụng chúng (G13 — release build in-container, chỉ cần docker login) → không duplicate setup logic; "dry-run verify" xuất hiện 2 lần = Zweck task của TỪNG SF (không tính duplicate theo rule); docs 2 SF = artifacts khác nhau (README CI section vs release runbook). Không pattern nào ≥50% chung → giữ 2 SF, không cần shared tier thêm.

**Không có UI surface** → `Design: none` mọi SF; designer không tham gia story này (9-agent team: PM, phase0, spec-critic, plan-critic, task-executor ×2, code-reviewer, verifier, security-audit).

## 8. Tương tác FI-310

- Merge order: tự do cho phần CI; **ràng buộc duy nhất (G2/G10) — story này merge master trước lần tag `phase-*` tự động hóa đầu tiên** (tag-push chạy workflow từ tagged commit). Nếu phase-2 PR merge TRƯỚC story này → phase-2 tag thủ công như P1 (không images tự động), phase-3 trở đi dùng pipeline mới.
- Conflict dự kiến: README.md (cả hai sửa) — resolve lúc merge, không block.

## 9. Story-close checklist (SAU khi NGƯỜI merge story PR — không phải task của SF)

1. Bật branch protection VĨNH VIỄN (script SF-1 — giờ master đã chứa `ci.yml` nên required checks chạy được trên mọi PR mới) + `gh pr update-branch` cho mọi PR đang mở (G3).
2. GHCR flip-public cho các package mới (nếu owner chưa làm trong verify) + verify anonymous pull.
3. Comment lên epic FI-310 cho coordinator: (a) SF mới cần copy `docker-java.properties` (convention sẵn), (b) identity Dockerfile gap, (c) CI giờ chạy trên push nhánh SF — đỏ cần fix trước phase release, (d) quy trình tag MỚI: tag master HEAD sau merge.
4. Follow-up đề xuất (1 comment Linear backlog): CodeQL + Dependabot + secret-scanning tuning; pytest job khi invoice-service xuất hiện; `NEXT_PUBLIC_*` build env cho storefront khi P2 gần release.
