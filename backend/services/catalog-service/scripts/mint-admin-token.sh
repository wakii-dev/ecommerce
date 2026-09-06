#!/usr/bin/env bash
# Mint dev JWT RS256 cho admin API (Task 8b) — chỉ bash + openssl, không deps.
#
# Usage:
#   TOKEN=$(backend/services/catalog-service/scripts/mint-admin-token.sh [ROLE])
#   curl -H "Authorization: Bearer $TOKEN" http://localhost:8082/api/catalog/admin/products
#
#   ROLE mặc định ADMIN (ROLE_ADMIN); truyền ví dụ CUSTOMER để test 403.
#   Key đọc từ infra/keys/jwt-private.pem — resolve TƯƠNG ĐỐI với vị trí script
#   nên chạy được từ bất kỳ CWD nào. Sinh key: `make keys` ở repo root.
#   Token hết hạn sau 1 giờ.
set -euo pipefail

ROLE="${1:-ADMIN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIVATE_KEY="${SCRIPT_DIR}/../../../../infra/keys/jwt-private.pem"

if [ ! -f "$PRIVATE_KEY" ]; then
  echo "✗ Không tìm thấy private key: $PRIVATE_KEY — chạy 'make keys' ở repo root" >&2
  exit 1
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

now="$(date +%s)"
exp=$((now + 3600))
header='{"alg":"RS256","typ":"JWT"}'
payload="$(printf '{"sub":"dev-admin","roles":["%s"],"iat":%s,"exp":%s}' "$ROLE" "$now" "$exp")"

h64="$(printf '%s' "$header" | b64url)"
p64="$(printf '%s' "$payload" | b64url)"
sig="$(printf '%s' "$h64.$p64" | openssl dgst -sha256 -sign "$PRIVATE_KEY" | b64url)"

printf '%s.%s.%s\n' "$h64" "$p64" "$sig"
