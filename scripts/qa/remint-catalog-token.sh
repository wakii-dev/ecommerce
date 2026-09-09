#!/usr/bin/env bash
# SF-5 (FI-402) — re-mint CATALOG_API_TOKEN cho ordering container (rig B isolate).
# Dùng khi ordering re-price 502 "Catalog ... 401" (token 15'/60' hết hạn).
# Cách dùng: bash scripts/qa/remint-catalog-token.sh   (từ repo root, rig B sống)
set -euo pipefail
cd "$(dirname "$0")/../.."
GW="${RIG_GATEWAY:-http://localhost:8480}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.vn}"; ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
TOKEN=$(curl -sf -m 8 -X POST "$GW/api/identity/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")
[ -n "$TOKEN" ] || { echo "✗ mint token fail"; exit 1; }
cat > scripts/qa/docker-override-sf5-token.yml <<YML
# SF-5 QA override #3 — AUTO-GENERATED bởi remint-catalog-token.sh lúc $(date -u +%FT%TZ)
services:
  ordering-service:
    environment:
      CATALOG_API_TOKEN: $TOKEN
YML
COMPOSE_PROJECT_NAME=fi397sf5 docker compose -p fi397sf5 \
  -f docker-compose.yml -f docker-compose.override-sf2.yml \
  -f scripts/qa/docker-override-sf5-keys.yml -f scripts/qa/docker-override-sf5-net.yml \
  -f scripts/qa/docker-override-sf5-identity-ttl.yml \
  -f scripts/qa/docker-override-sf5-token.yml --profile full up -d \
  | grep -E "ordering|identity" || true
echo "✓ ordering recreated với token mới (hết hạn sau JWT_ACCESS_TTL_SECONDS)"
