#!/usr/bin/env bash
# SF-5 (FI-402) — re-mint CATALOG_API_TOKEN cho ordering container (rig B isolate).
# Dùng khi ordering re-price 502 "Catalog ... 401".
# THỨ TỰ QUAN TRỌNG (bài học 12:11-401): recreate identity TRƯỚC (để TTL 3600
# áp dụng), chờ health, MỚI mint — nếu mint trước thì token mang TTL cũ 900s.
# Security (audit FI-402): override chứa JWT ghi vào .run/ (gitignored) — KHÔNG
# commit token; mỗi lần chạy tự sinh mới.
# Cách dùng: bash scripts/qa/remint-catalog-token.sh   (từ repo root, rig B sống)
set -euo pipefail
cd "$(dirname "$0")/../.."
GW="${RIG_GATEWAY:-http://localhost:8480}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.vn}"; export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
OVF=( -f docker-compose.yml -f docker-compose.override-sf2.yml
      -f scripts/qa/docker-override-sf5-keys.yml -f scripts/qa/docker-override-sf5-net.yml
      -f scripts/qa/docker-override-sf5-identity-ttl.yml
      -f scripts/qa/docker-override-sf5-es-heap.yml )
export COMPOSE_PROJECT_NAME=fi397sf5

# 1. Identity với TTL dài sống trước (idempotent — đã đúng env thì không recreate)
docker compose -p fi397sf5 "${OVF[@]}" --profile full up -d identity-service >/dev/null 2>&1 || true
sleep 2
for i in $(seq 1 30); do
  curl -sf -m 3 "$GW/api/identity/actuator/health" >/dev/null 2>&1 && break
  curl -sf -m 3 "$GW/actuator/health" >/dev/null 2>&1 && break
  sleep 4
done

# 2. Mint token (identity 3600s → token 1 giờ). JSON build bằng python để
#    escape an toàn password chứa ký tự đặc biệt.
TOKEN=$(curl -sf -m 8 -X POST "$GW/api/identity/auth/login" -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,os; print(json.dumps({'email':os.environ['ADMIN_EMAIL'],'password':os.environ['ADMIN_PASSWORD']}))")" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")
[ -n "$TOKEN" ] || { echo "✗ mint token fail"; exit 1; }

# 3. Override ghi vào .run/ (gitignored) + recreate ordering
mkdir -p .run
python3 - "$TOKEN" > .run/sf5-token-override.yml <<'PY'
import sys
print("# SF-5 QA override #3 — AUTO-GENERATED bởi remint-catalog-token.sh — KHÔNG commit")
print("services:")
print("  ordering-service:")
print("    environment:")
print(f"      CATALOG_API_TOKEN: {sys.argv[1]}")
PY
docker compose -p fi397sf5 "${OVF[@]}" -f .run/sf5-token-override.yml --profile full up -d ordering-service 2>&1 | tail -1
echo "✓ ordering recreated — token TTL 3600s (verify: POST /api/ordering/orders không còn 502)"
