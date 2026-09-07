#!/usr/bin/env bash
# dev-stack.sh (SF-10) — 1 LỆNH full stack dev mode:
#   compose infra → db-ensure (volume cũ thiếu DB) → build jar (1 lần) →
#   boot 10 backend + invoice python (background, health-wait) → 5 FE app
#   (turbo dev --parallel). Logs + PID tại .run/.
# Idempotent: service đã health → skip. `dev-stop.sh` dừng sạch (kill theo PID
# port — memory port-squatting: không tin tên, tin PID listener).
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_DIR=".run"; LOG_DIR="$RUN_DIR/logs"; mkdir -p "$LOG_DIR"

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
  if health "$2"; then log "$1 đã UP — skip"; return 0; fi
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

# ── 6. frontend (turbo dev --parallel: shell+account+checkout+admin+skeleton+next) ──
if ! curl -sf -m 2 http://localhost:5173 >/dev/null; then
  log "boot FE (turbo dev --parallel :5173-5178 + :3000)…"
  ( cd frontend && nohup pnpm turbo run dev --parallel > ../"$LOG_DIR/frontend.log" 2>&1 & echo $! > ../"$RUN_DIR/frontend.pid" )
  sleep 8
fi

cat <<'EOF'

✓ dev stack sống:
  gateway(nav dev) :8080 · storefront-web :3000 · shell :5173 · checkout :5175
  account :5176 · admin :5177 · identity :8081 · catalog :8082 · cart :8083
  inventory :8084 · ordering :8085 · payment :8086 · notification :8087
  log :8088 · mongo-express :8089 · invoice :8090 · partner-api :8091
  affiliate :8092 · Mailpit UI :8025 · RabbitMQ UI :15672
  logs: .run/logs/*.log · dừng: make dev-stop
EOF
