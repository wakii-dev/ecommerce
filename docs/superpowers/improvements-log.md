# Superpowers workflow improvements log

> SF agents append khi gặp gap của workflow/skill/tools trong lúc chạy — KHÔNG tự sửa skill. User review định kỳ.

| Date | Issue | What | Where | Suggested change |
|---|---|---|---|---|
| 2026-09-06 | FI-311 (SF-1) | `story-verify` hardcode `ORCA_BIN=/opt/homebrew/bin/orca` — máy này orca ở `/usr/local/bin/orca` → B3 luôn OUTBOX dù verdict đã post Linear | `~/.claude/bin/story-verify` (ORCA_BIN resolution) | Thêm fallback probe `which orca`, hoặc đọc từ `.claude/discovery-config.json` |
| 2026-09-06 | FI-311 (SF-1) | Spec ghi sai package MF cho Vite: `@module-federation/enhanced` là webpack-only; đúng là `@module-federation/vite` | `docs/superpowers/contexts/sf-1.md` mục 8 + epic spec D2 + bracket SF-2 | Coordinator sửa text (REQUIREMENT-GAP đã post lên FI-310; code đã đúng theo package mới) |
| 2026-09-06 | FI-311 (SF-1) | `orca orchestration task-update` cần run binding nhưng `run-use` không tồn tại trong CLI version này → SF executor không tự complete DAG task của mình | Orca CLI orchestration surface | Thêm `--run` flag cho task-update, hoặc watchdog tự hoàn tất task khi Linear Done |
| 2026-09-06 | FI-311 (SF-1) | Story coordinator push docs vào dest NHANH hơn merge cadence của SF (3 lần trong 1 run: D14-D22) — SF executor phải merge-sync lại nhiều lần; guard CAS đã chặn đúng | shared-file ownership §6 | Coordinator có thể batch scope-addenda, hoặc thông báo "freeze docs 15 phút" khi SF đang ở giai đoạn merge |
