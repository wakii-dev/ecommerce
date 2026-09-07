#!/usr/bin/env bash
# sanity.sh (SF-10) — PERF + SECURITY sanity (pack item 9). Chạy với dev stack
# đang sống. Output = bằng chứng ghi vào audit comment (không assert cứng).
set -uo pipefail
cd "$(dirname "$0")/.."
# .env có giá trị chứa dấu cách (INVOICE_SELLER_NAME tiếng Việt) — KHÔNG
# source trực tiếp (set -a . .env sẽ chạy value như command). Parse KEY=VALUE:
while IFS= read -r _line; do
  case "$_line" in ''|\#*) continue ;; esac
  export "$_line" 2>/dev/null || true
done < .env

GW=http://localhost:8080

echo "═══ PERF SANITY ═══"
# 1) Catalog cache hit: gọi PDP public 2 lần — lần 2 nhanh hơn hoặc bằng
#    (Redis cache product detail); đo bằng curl time_total.
SLUG=$(curl -s "$GW/api/catalog/products?page=1&size=1" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items') or d.get('products') or []; print(items[0].get('slugVi') or items[0].get('slug',''))" 2>/dev/null)
if [ -n "${SLUG:-}" ]; then
  T1=$(curl -s -o /dev/null -w '%{time_total}' "$GW/api/catalog/products/$SLUG")
  T2=$(curl -s -o /dev/null -w '%{time_total}' "$GW/api/catalog/products/$SLUG")
  echo "PDP /products/$SLUG — lần 1: ${T1}s · lần 2 (cache): ${T2}s"
  KEY_COUNT=$(docker compose exec -T redis redis-cli --scan --pattern '*catalog*' 2>/dev/null | wc -l | tr -d ' ')
  echo "Redis keys catalog*: $KEY_COUNT"
else
  echo "⚠ không lấy được slug — skip cache timing"
fi

# 2) PLP/search không N+1 rõ rệt: 1 request list → tổng thời gian hợp lý
ST=$(curl -s -o /dev/null -w '%{time_total}' "$GW/api/catalog/search?q=tai&locale=vi&page=1&size=24")
echo "search 24 items: ${ST}s (N+1 rõ rệt sẽ > 1s cục bộ)"

echo ""
echo "═══ SECURITY SANITY ═══"
# 1) Secrets không nằm trong code: grep pattern key thật trong tracked files
LEAK=$(git grep -nIE '(sk_live_|pk_live_|sk_test_[a-zA-Z0-9]{20,}|whsec_[a-zA-Z0-9]{20,})' -- . ':!*.md' 2>/dev/null | grep -v 'sk_test_xxx' | head -5)
if [ -z "$LEAK" ]; then echo "✓ không có Stripe key thật trong git (chỉ .env gitignored)"; else echo "✗ LEAK:"; echo "$LEAK"; fi

# 2) Validation tại boundaries: register email sai → 400/422 (không 500)
V1=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/api/identity/auth/register" \
  -H 'Content-Type: application/json' -d '{"email":"not-an-email","password":"x","fullName":""}')
echo "register email sai → HTTP $V1 (mong đợi 400/422, KHÔNG 500)"

# 3) coupon: min_order_value chặn (GIAM50K min 500k)
V2=$(curl -s -X POST "$GW/api/ordering/orders/validate-coupon" -H 'Content-Type: application/json' \
  -d '{"code":"GIAM50K","subtotal":100000}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('valid'))")
echo "GIAM50K với subtotal 100k (< min 500k) → valid=$V2 (mong đợi False)"

# 4) RBAC 2 lớp (chi tiết ở e2e rbac.spec)
V3=$(curl -s -o /dev/null -w '%{http_code}' "$GW/api/ordering/admin/orders")
echo "admin API không token → HTTP $V3 (mong đợi 401)"

echo ""
echo "XONG — paste output này vào audit comment T11."
