#!/usr/bin/env bash
# dev-stack.sh (SF-10) — 1 LỆNH full stack dev mode:
#   compose infra → db-ensure (volume cũ thiếu DB) → build jar (1 lần) →
#   boot 10 backend + invoice python (background, health-wait) → 5 FE app
#   (turbo dev --parallel). Logs + PID tại .run/.
# Idempotent: service đã health → skip. `dev-stop.sh` dừng sạch (kill theo PID
# port — memory port-squatting: không tin tên, tin PID listener).
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_DIR="$PWD/.run"; LOG_DIR="$RUN_DIR/logs"
# ABSOLUTE: subshell `cd frontend` (FE boot) ghi PID/log qua ../.run — path
# tương đối vỡ khi cwd đổi (boot 3 lần 08-09: "../.run/frontend.pid: No such
# file or directory"). mkdir -p lại trước mọi ghi (dev-stop có thể xoá .run).
mkdir -p "$RUN_DIR" "$LOG_DIR"

# ── env: đọc .env (compose tự đọc; host JVM cần export) ──────────────────────
# .env có giá trị chứa dấu cách (INVOICE_SELLER_NAME tiếng Việt) — KHÔNG
# source trực tiếp (set -a . .env sẽ chạy value như command). Parse KEY=VALUE:
while IFS= read -r _line; do
  case "$_line" in ''|\#*) continue ;; esac
  export "$_line" 2>/dev/null || true
done < .env
export GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
export CATALOG_API_TOKEN="${CATALOG_API_TOKEN:-}"

log() { printf '\033[36m[dev-stack]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[dev-stack] ✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── single-session guard (FI-366 SF-1 T3) ────────────────────────────────────
# Session = pid của re-mint loop (process sống dài nhất của session — script
# này exit sau khi boot xong). Session khác đang chạy → chặn, không tự đoán.
# dev-stop (rm .run/*.pid + kill) gỡ guard; crash để lại stale pid-dead → dọn.
SESSION_PID_FILE="$RUN_DIR/dev-stack-session.pid"
if [ -f "$SESSION_PID_FILE" ]; then
  OLD_PID=$(cat "$SESSION_PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    fail "dev-stack session đang chạy (PID $OLD_PID) — 'make dev-stop' trước khi start lại (single-session guard)"
  fi
  rm -f "$SESSION_PID_FILE"
fi

# ── TTL re-mint (FI-366 SF-1 T3) ─────────────────────────────────────────────
# 2 nửa: (1) identity boot với access-TTL 3600s thay vì 15' (env overridable —
# cải thiện improvements-log "CATALOG_API_TOKEN mint TTL 15' làm order create
# 502 sau 15' uptime"); (2) loop scripts/dev-stack-re-mint.sh re-mint mỗi 25'
# + restart ĐÚNG 2 consumer bake token lúc boot (ordering, partner-api —
# HttpCatalogPricingClient defaultHeader build-time → re-export env vô dụng).
export JWT_ACCESS_TTL_SECONDS="${JWT_ACCESS_TTL_SECONDS:-3600}"
nohup bash scripts/dev-stack-re-mint.sh > /dev/null 2>&1 &
RE_MINT_PID=$!
echo "$RE_MINT_PID" > "$RUN_DIR/token-re-mint.pid"
echo "$RE_MINT_PID" > "$SESSION_PID_FILE"
log "single-session guard ON (session pid $RE_MINT_PID) · token re-mint loop mỗi $(( ${RE_MINT_INTERVAL:-1500} / 60 ))'"
# Boot FAIL giữa chừng → session không được giữ (kẻ chặn make dev lần sau).
# Boot thành công → script exit thường, trap gỡ ở cuối file (session sống cùng stack).
cleanup_failed_session() { kill "$RE_MINT_PID" 2>/dev/null || true; rm -f "$SESSION_PID_FILE" "$RUN_DIR/token-re-mint.pid"; }
trap cleanup_failed_session EXIT

health() { curl -sf -m 2 "http://localhost:$1/actuator/health" 2>/dev/null | grep -q '"UP"'; }
wait_health() { # $1 port $2 tên $3 timeout_s
  local deadline=$((SECONDS + ${3:-90}))
  while [ $SECONDS -lt $deadline ]; do
    if health "$1"; then log "$2 health UP (: $1)"; return 0; fi
    sleep 2
  done
  fail "$2 không UP sau ${3}s — xem $LOG_DIR/$2.log"
}

record_pid() { echo "$2" > "$RUN_DIR/$1.pid"; }

port_pid() { lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true; }

start_jvm() { # $1 tên $2 port $3 module-path
  if health "$2"; then
    # health UP ≠ jar CỦA MÌNH — port có thể bị JVM worktree khác giữ
    # (08-09: cả 10 port giữ bởi jar sf-13 cũ, dev-stack skip hết → test
    # nhầm code cũ). Verify cwd của listener nằm trong repo này, không → fail.
    local lpid lcwd
    lpid=$(port_pid "$2")
    if [ -n "$lpid" ]; then
      lcwd=$(lsof -p "$lpid" 2>/dev/null | awk '$4=="cwd" {print $NF}')
      case "$lcwd" in
        "$PWD") log "$1 đã UP — skip (jar của worktree này)" ;;
        *) fail "port $2 ($1) đang giữ bởi process ngoài worktree (pid $lpid, cwd $lcwd) — kill nó hoặc make dev-stop trước" ;;
      esac
    else
      log "$1 đã UP — skip (listener không xác định PID)"
    fi
    return 0
  fi
  if [ -f "$RUN_DIR/$1.pid" ] && kill -0 "$(cat "$RUN_DIR/$1.pid")" 2>/dev/null; then
    log "$1 pid $(cat "$RUN_DIR/$1.pid") đang chạy nhưng chưa health — chờ"; wait_health "$2" "$1" 60; return 0
  fi
  log "boot $1 (jar $3)…"
  nohup java -jar "backend/$3/target/"*.jar > "$LOG_DIR/$1.log" 2>&1 &
  record_pid "$1" "$!"
  # ghi PID THẬT của listener java (mvn con đã bỏ — chạy java trực tiếp)
  sleep 1
  local lpid; lpid=$(port_pid "$2"); [ -n "$lpid" ] && echo "$lpid" >> "$RUN_DIR/$1.port.pid"
  wait_health "$2" "$1" 120
}

# ── 1. infra ─────────────────────────────────────────────────────────────────
log "compose infra up…"
docker compose up -d
log "chờ postgres/rabbitmq/mongo/es healthy…"
for i in $(seq 1 60); do
  ok=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"') || ok=0
  [ "${ok:-0}" -ge 6 ] && break
  sleep 3
done

# ── 2. db-ensure (init script chỉ chạy volume RỖNG — volume cũ thiếu DB mới) ─
for db in db_notification db_partner db_affiliate db_identity db_catalog db_ordering db_payment db_inventory; do
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
    docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d postgres -c "CREATE DATABASE $db" >/dev/null && log "db $db OK"
done

# ── 3. keys + jars ───────────────────────────────────────────────────────────
[ -f infra/keys/jwt-private.pem ] || make keys
log "build jar (skip tests, 1 lần)…"
# -Dmaven.test.skip=true: skip cả test-COMPILE (SagaTest SF-9 import nội bộ
# inventory — pre-existing, spring-boot:run không compile test nên không lộ)
mvn -q -f backend/pom.xml -pl gateway,services/identity-service,services/catalog-service,services/cart-service,services/inventory-service,services/ordering-service,services/payment-service,services/notification-service,services/log-service,services/affiliate-service,services/partner-api -am package -Dmaven.test.skip=true

# ── 4. invoice-service (python) ──────────────────────────────────────────────
if ! curl -sf -m 2 http://localhost:8090/health >/dev/null; then
  log "boot invoice-service :8090…"
  ( cd services/invoice-service && test -x .venv/bin/uvicorn || { python3 -m venv .venv && .venv/bin/pip install --quiet "fastapi>=0.115" "uvicorn>=0.30" "reportlab>=4.2" "pydantic>=2.8"; } && nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8090 > ../../"$LOG_DIR/invoice-service.log" 2>&1 & echo $! > ../../"$RUN_DIR/invoice-service.pid" )
  sleep 3
fi

# ── 5. backends (identity TRƯỚC — JWKS cho mọi service) ─────────────────────
start_jvm identity      8081 services/identity-service
start_jvm gateway       8080 gateway

# Mint admin JWT cho CATALOG_API_TOKEN (interim GAP SF-9: ordering re-price
# gọi catalog admin-by-id cần JWT ADMIN; TTL 15' — stack chạy dài cần boot lại
# hoặc tăng JWT_ACCESS_TTL_SECONDS trong .env). Không set → re-price 502.
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  TOKEN=$(curl -s -m 5 -X POST http://localhost:8081/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || true)
  if [ -n "${TOKEN:-}" ]; then
    export CATALOG_API_TOKEN="$TOKEN"
    log "CATALOG_API_TOKEN minted (TTL 15') — ordering re-price OK"
  else
    log "⚠ mint CATALOG_API_TOKEN fail (ADMIN_EMAIL/PASSWORD sai?) — re-price sẽ 502"
  fi
fi

start_jvm catalog       8082 services/catalog-service
start_jvm cart          8083 services/cart-service
start_jvm inventory     8084 services/inventory-service
start_jvm ordering      8085 services/ordering-service
start_jvm payment       8086 services/payment-service
start_jvm notification  8087 services/notification-service
start_jvm log           8088 services/log-service
start_jvm affiliate     8092 services/affiliate-service
start_jvm partner-api   8091 services/partner-api

# ── 6. frontend — guard 2 chân (FI-400 D6): boot khi ≥1 leg chết; skip chỉ khi ─
# CẢ HAI sống (entry + shell là 2 process riêng — nửa sống nửa chết vẫn phải
# boot để leg chết dậy). env-aware: rig offset set DEV_ENTRY_URL/SHELL_ORIGIN.
ENTRY_URL="${DEV_ENTRY_URL:-http://localhost:3000}"
SHELL_DEV_URL="${SHELL_ORIGIN:-http://localhost:5173}"
entry_up=0; shell_up=0
if curl -sf -m 2 "$ENTRY_URL" >/dev/null; then entry_up=1; fi
if curl -sf -m 2 "$SHELL_DEV_URL" >/dev/null; then shell_up=1; fi
if [ "$entry_up" -eq 1 ] && [ "$shell_up" -eq 1 ]; then
  log "FE đã sống — skip (entry $ENTRY_URL + shell $SHELL_DEV_URL cùng UP)"
else
  entry_state=down; shell_state=down
  if [ "$entry_up" -eq 1 ]; then entry_state=up; fi
  if [ "$shell_up" -eq 1 ]; then shell_state=up; fi
  log "boot FE (entry $ENTRY_URL $entry_state / shell $SHELL_DEV_URL $shell_state)…"
  ( cd frontend && nohup pnpm turbo run dev --parallel > "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$RUN_DIR/frontend.pid" )
  sleep 8
  # health check entry — warn-only: Next chậm lên không fail script (backend đã xong)
  if curl -sf -m 2 "$ENTRY_URL" >/dev/null; then
    log "✓ entry $ENTRY_URL sống (1-origin)"
  else
    log "⚠ entry $ENTRY_URL chưa trả lời (Next :3000 chưa lên? xem .run/logs/frontend.log)"
  fi
fi

# banner: 1 URL entry + chế độ remotes (detect env — .env đã export ở đầu script;
# REMOTE_* absolute = kill-switch 2-origin legacy; NEXT_PUBLIC_SHELL_URL = leak links)
if [[ "${REMOTE_CHECKOUT_URL:-}" =~ ^http ]]; then
  remotes_mode="2-origin legacy (REMOTE_*_URL absolute trong .env — đổi /remotes/<name> để vào 1-origin)"
else
  remotes_mode="1-origin (/remotes/* qua entry)"
fi
shell_warn=""
if [ -n "${NEXT_PUBLIC_SHELL_URL:-}" ]; then
  shell_warn=$'\n  ⚠ links storefront→shell cross-origin (NEXT_PUBLIC_SHELL_URL set) — bỏ trống .env để same-origin'
fi
cat <<EOF

✓ dev stack sống:
  entry: $ENTRY_URL — 1 URL (storefront + shell routes + /admin)
  remotes: $remotes_mode$shell_warn
  gateway(nav dev) :8080 · entry :3000 · shell :5173 · checkout :5175
  account :5176 · admin :5177 · identity :8081 · catalog :8082 · cart :8083
  inventory :8084 · ordering :8085 · payment :8086 · notification :8087
  log :8088 · mongo-express :8089 · invoice :8090 · partner-api :8091
  affiliate :8092 · Mailpit UI :8025 · RabbitMQ UI :15672
  logs: .run/logs/*.log · dừng: make dev-stop
EOF
trap - EXIT   # boot xong sạch — session sống cùng stack (guard giữ loop pid)
