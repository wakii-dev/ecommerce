#!/usr/bin/env bash
# dev-stack-re-mint.sh (FI-366 SF-1 T3) — re-mint CATALOG_API_TOKEN định kỳ.
#
# WHY: token bake vào RestClient defaultHeader LÚC BOOT (ordering
# HttpCatalogPricingClient constructor, partner-api CatalogClient tương tự)
# → re-export env không tác động JVM đang chạy; TTL mặc định 15' của identity
# làm ordering re-price + partner catalog proxy 502 sau 15' uptime
# (improvements-log, dev-stack.sh comment SF-10). dev-stack.sh boot identity
# với JWT_ACCESS_TTL_SECONDS=3600 (nửa 1); loop này là nửa 2: mỗi 25' login
# admin lấy token mới → restart ĐÚNG 2 consumer với env mới.
#
# Vòng đời: pid tại .run/token-re-mint.pid — dev-stop (rm .run/*.pid + kill)
# chấm dứt; file pid biến mất/khác pid mình → loop tự exit. dev-stack guard
# session trỏ pid này (single-session check).
set -uo pipefail
cd "$(dirname "$0")/.."

RUN_DIR="$PWD/.run"; LOG_DIR="$RUN_DIR/logs"   # absolute — subshell-restart an toàn
INTERVAL="${RE_MINT_INTERVAL:-1500}"   # 25' — TTL 60' → re-mint an toàn trong cửa sổ
MY_PID=$$

mkdir -p "$RUN_DIR" "$LOG_DIR"
log() { printf '%s [re-mint] %s\n' "$(date +%H:%M:%S)" "$*" >> "$LOG_DIR/re-mint.log"; }

# .env — cùng quy tắc parse với dev-stack.sh (value có dấu cách)
while IFS= read -r _line; do
  case "$_line" in ''|\#*) continue ;; esac
  export "$_line" 2>/dev/null || true
done < .env

alive() { [ -f "$RUN_DIR/token-re-mint.pid" ] && [ "$(cat "$RUN_DIR/token-re-mint.pid" 2>/dev/null)" = "$MY_PID" ]; }

mint() {
  curl -s -m 5 -X POST http://localhost:8081/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL:-}\",\"password\":\"${ADMIN_PASSWORD:-}\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null
}

wait_health() { # $1 port $2 tên
  local deadline=$((SECONDS + 120))
  while [ $SECONDS -lt $deadline ]; do
    curl -sf -m 2 "http://localhost:$1/actuator/health" 2>/dev/null | grep -q '"UP"' && return 0
    sleep 2
  done
  return 1
}

restart_consumer() { # $1 tên $2 port $3 module-path (backend/<path>/target/*.jar)
  local pids lp
  pids=$(cat "$RUN_DIR/$1.pid" "$RUN_DIR/$1.port.pid" 2>/dev/null | sort -u)
  for p in $pids; do kill "$p" 2>/dev/null || true; done
  sleep 3
  # port còn nghe (shutdown chậm/PID lệch) → kill theo listener (memory: tin PID port)
  lp=$(lsof -ti tcp:"$2" -sTCP:LISTEN 2>/dev/null | head -1 || true)
  [ -n "$lp" ] && kill "$lp" 2>/dev/null
  rm -f "$RUN_DIR/$1.pid" "$RUN_DIR/$1.port.pid"
  CATALOG_API_TOKEN="$NEW_TOKEN" nohup java -jar "backend/$3/target/"*.jar >> "$LOG_DIR/$1.log" 2>&1 &
  echo $! > "$RUN_DIR/$1.pid"
  sleep 1
  lp=$(lsof -ti tcp:"$2" -sTCP:LISTEN 2>/dev/null | head -1 || true)
  [ -n "$lp" ] && echo "$lp" >> "$RUN_DIR/$1.port.pid"
  if wait_health "$2" "$1"; then
    log "$1 restart OK với token mới (: $2)"
  else
    log "✗ $1 không UP sau restart — xem $LOG_DIR/$1.log"
  fi
}

sleep "$INTERVAL"
while alive; do
  NEW_TOKEN=$(mint)
  if [ -n "${NEW_TOKEN:-}" ] && [ "$NEW_TOKEN" != "${CATALOG_API_TOKEN:-}" ]; then
    export CATALOG_API_TOKEN="$NEW_TOKEN"
    log "token re-minted — restart 2 consumer (ordering, partner-api)"
    restart_consumer ordering 8085 services/ordering-service
    restart_consumer partner-api 8091 services/partner-api
  fi
  sleep "$INTERVAL"
done
log "loop thoát (pid file biến mất/khác mình — dev-stop hoặc session mới)"
