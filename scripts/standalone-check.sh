#!/usr/bin/env bash
# standalone-check.sh (SF-10, §5.4) — MỖI service chạy standalone với compose
# infra: stop listener trên port service → boot `make dev svc=<name>` (vite/
# spring-boot:run như dev thật) → chờ /actuator/health (hoặc /health với
# invoice) → kill. Không đụng service đang chạy khác.
#
# Chạy: bash scripts/standalone-check.sh [svc ...]   (mặc định: TẤT CẢ)
set -uo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi

declare -A PORT=(
  [identity]=8081 [catalog]=8082 [cart]=8083 [inventory]=8084 [ordering]=8085
  [payment]=8086 [notification]=8087 [log]=8088 [invoice-service]=8090
  [partner-api]=8091 [affiliate]=8092 [gateway]=8080
)
SERVICES=("$@")
[ ${#SERVICES[@]} -eq 0 ] && SERVICES=(identity catalog cart inventory ordering payment notification log invoice-service partner-api affiliate gateway)

health_url() { # invoice-service dùng /health, còn lại actuator
  if [ "$1" = "invoice-service" ]; then echo "http://localhost:${PORT[$1]}/health"; else
    echo "http://localhost:${PORT[$1]}/actuator/health"; fi
}

FAIL=0
for svc in "${SERVICES[@]}"; do
  port=${PORT[$svc]:-}
  [ -z "$port" ] && { echo "✗ không biết port $svc"; FAIL=1; continue; }

  # service đã chạy (dev stack) → coi là pass standalone-check của Service đó
  if curl -sf -m 2 "$(health_url "$svc")" >/dev/null 2>&1; then
    echo "✓ $svc (đang chạy, health UP)"
    continue
  fi

  echo "… boot standalone $svc :$port"
  if [ "$svc" = "gateway" ]; then
    ( cd backend && nohup mvn -q -pl gateway spring-boot:run > ".run-sa-$svc.log" 2>&1 & echo $! > ".run-sa-$svc.pid" )
  elif [ "$svc" = "invoice-service" ]; then
    ( cd services/invoice-service && test -x .venv/bin/uvicorn || { python3 -m venv .venv && .venv/bin/pip install --quiet "fastapi>=0.115" "uvicorn>=0.30" "reportlab>=4.2" "pydantic>=2.8"; }; nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8090 > "../../.run-sa-$svc.log" 2>&1 & echo $! > "../../.run-sa-$svc.pid" )
  else
    case "$svc" in
      identity) MOD=services/identity-service ;;
      catalog) MOD=services/catalog-service ;;
      cart) MOD=services/cart-service ;;
      inventory) MOD=services/inventory-service ;;
      ordering) MOD=services/ordering-service ;;
      payment) MOD=services/payment-service ;;
      notification) MOD=services/notification-service ;;
      log) MOD=services/log-service ;;
      affiliate) MOD=services/affiliate-service ;;
      partner-api) MOD=services/partner-api ;;
    esac
    ( cd backend && nohup mvn -q -pl "$MOD" spring-boot:run > "../.run-sa-$svc.log" 2>&1 & echo $! > "../.run-sa-$svc.pid" )
  fi

  UP=0
  for i in $(seq 1 60); do
    if curl -sf -m 2 "$(health_url "$svc")" 2>/dev/null | grep -q '"UP"'; then UP=1; break; fi
    sleep 3
  done

  pid=$(cat ".run-sa-$svc.pid" 2>/dev/null)
  if [ "$UP" = "1" ]; then echo "✓ $svc health UP"; else echo "✗ $svc KHÔNG UP sau 180s — xem .run-sa-$svc.log"; FAIL=1; fi
  [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null
  # kill listener port còn sót (mvn con)
  lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  sleep 2
done

rm -f .run-sa-*.pid
[ "$FAIL" = "0" ] && echo "ALL STANDALONE OK" || exit 1
