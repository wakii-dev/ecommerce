# Story: FI-336 — GitHub Actions: CI + dev + prod

Destination: story/fi336-github-actions-ci-dev-prod

Epic spec: docs/superpowers/specs/2026-09-06-github-actions-ci-dev-prod.md
Context packs: docs/superpowers/contexts/fi336/sf-<n>.md (mỗi SF đọc pack TRƯỚC khi code — subdirectory riêng, không đè packs FI-310)

## SF-1 ci-pipeline
Tier: 0
linear:
Design: none
What: CI checks tự động chạy đúng trên mọi nhánh làm việc — push lên nhánh story/SF (hoặc PR vào master) → GitHub tab Actions hiện run với jobs xanh/đỏ THEO ĐƯỜNG DẪN thay đổi (contracts lint khi contracts đổi; backend verify khi backend đổi; frontend build/test/lint khi frontend đổi; workflow-lint luôn chạy); backend KHÔNG BAO GIỜ xanh-ảo (docker gate + per-module zero-test guard); PR vào master bị chặn merge khi check đỏ (classic branch protection — script + demo cửa sổ toggle; bật vĩnh viễn là story-close step sau merge, master phải chứa ci.yml trước); workflow YAML tự được lint. demo: push commit sửa backend lên nhánh story test → thấy run xanh với đúng tập jobs; PR test đỏ → nút merge disabled (trong cửa sổ toggle).
Depends on: —
Tasks: maven-wrapper-add / composite-action-setup-backend / composite-action-setup-frontend / ci-workflow-skeleton-triggers-concurrency / changes-path-filter-job / workflow-lint-actionlint-job / contracts-spectral-lint-job-pinned / backend-verify-job-docker-gate / surefire-zero-test-guard-per-module / frontend-turbo-job-gendrift / fail-artifacts-upload / readme-ci-section-badges / verify-first-ci-runs-probe / branch-protection-script-toggle-window-demo

## SF-2 images-release
Tier: 1
linear:
Design: none
What: Merge vào master → images `master-<sha>` xuất hiện trên ghcr.io cho MỌI service có Dockerfile (matrix auto-discovery — service mới thêm Dockerfile tự vào pipeline KHÔNG sửa workflow, module thiếu Dockerfile bị WARN trong job summary không im lặng); push tag `phase-*`/`v*` trên ref chứa release workflow → environment prod đòi approve (bằng chứng gate = trạng thái "Approval required" không kèm images; owner approve async — GitHub chặn self-approval) → images versioned + GitHub Release draft auto notes (create-or-update idempotent); workflow_dispatch env=dev/prod là tool test. demo: dispatch dev → pull image gateway anonymous được; tag test trên nhánh story → GH hiện "Approval required"; demo-service mới → matrix tự nhặt trong run thật.
Depends on: SF-1
Tasks: gateway-dockerfile-multistage / local-image-build-smoke / matrix-discovery-script-warn-baseline / release-workflow-skeleton-triggers-permissions / dev-image-build-push-ghcr / prod-image-build-push-environment-gate / release-notes-create-or-update / environments-setup-scripts-dev-prod / ghcr-visibility-flip-public-runbook / runbook-release-process-doc / makefile-image-local-target / dispatch-input-env-testing-tool / verify-first-dispatch-demo-live-cleanup
