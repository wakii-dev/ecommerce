#!/usr/bin/env bash
# run-e2e.sh (FI-366 SF-1 T1) — Playwright E2E serial.
#
# Điều kiện: dev stack ĐANG CHẠY (make dev) + .env (cp .env.example .env).
# Serial: playwright.config đã workers=1 + retries=1 (flaky retry 1 lần —
# đúng policy bug register; vẫn fail sau retry → register).
# Lọc spec đơn: run-e2e.sh golden-path  (đối số = grep title, như playwright).
set -euo pipefail
cd "$(dirname "$0")/../.."

LOG_DIR=".run/test-logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/e2e-$(date +%Y%m%d-%H%M%S).log"

curl -sf -m 3 http://localhost:8080/actuator/health >/dev/null || {
  echo "✗ gateway :8080 chưa sống — chạy \`make dev\` trước"; exit 1; }
[ -f .env ] || { echo "✗ thiếu .env — cp .env.example .env"; exit 1; }

echo "[run-e2e] playwright test (serial workers=1) — log: $LOG"
set +e
( cd frontend && pnpm --filter @ecommerce/e2e exec playwright test "$@" ) 2>&1 | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e
echo "[run-e2e] exit=$RC · log: $LOG"
exit "$RC"
