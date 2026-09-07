#!/usr/bin/env bash
# run-fe.sh (FI-366 SF-1 T1) — full FE unit suite qua turbo.
#
# --force: chạy THẬT mọi package (turbo cache replay logs cũ — báo pass từ
# cache kể cả khi test giờ fail → sai bug register).
# Package KHÔNG có script test (đã biết, không phải bug): apps/shell,
# apps/mfe-account, apps/_skeleton-remote.
set -euo pipefail
cd "$(dirname "$0")/../.."

LOG_DIR=".run/test-logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/fe-$(date +%Y%m%d-%H%M%S).log"

echo "[run-fe] turbo run test --force — log: $LOG"
set +e
pnpm -C frontend exec turbo run test --force 2>&1 | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e
echo "[run-fe] exit=$RC · log: $LOG"
exit "$RC"
