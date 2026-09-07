#!/usr/bin/env bash
# seed.sh (SF-10) — DETERMINISTIC SEED idempotent (pack slice item 5).
#
# Đường đi (ghi rõ theo pack — "tạo QUA API thật hoặc seed DB"):
#   - Accounts (admin@demo.vn, user@demo.vn, notification-svc): QUA API THẬT
#     identity (register 409 tolerate = idempotent) + promote role ADMIN bằng
#     SQL users.role (role là 1 cột varchar — không bảng roles).
#   - Coupons WELCOME10 (10%, min 100k, LIMIT 100, HẾT HẠN +30 ngày) +
#     GIAM50K (fixed 50k): SQL UPSERT db_ordering (V11 seed SF-9 thiếu
#     limit/expiry WELCOME10 — pack yêu cầu override).
#   - 2 đơn CONFIRMED: SEED DB TRỰC TIẾP (db_ordering.orders + order_items +
#     saga_state DONE + invoice_sequences cấp số HĐ + coupon_reservations
#     FINALIZED) — POST /orders thật cần Stripe keys + webhook → không chạy
#     được headless; đơn seed đủ data cho admin orders/dashboard/review
#     verified-purchase (review_eligibility). Guard: chỉ seed khi demo user
#     CHƯA có đơn (idempotent — chạy lại không nhân bản).
#   - 1 review APPROVED (verified=TRUE): SQL db_catalog reviews + review_
#     eligibility + rating_avg/rating_count denormalized update.
#   - Products/flash sale: catalog SeedDataRunner (SF-4) seed 24 sản phẩm +
#     refresh flash +2 ngày mỗi boot — script chỉ VERIFY (không đụng).
set -euo pipefail
cd "$(dirname "$0")/../.."

# .env có giá trị chứa dấu cách (INVOICE_SELLER_NAME tiếng Việt) — KHÔNG
# source trực tiếp (set -a . .env sẽ chạy value như command). Parse KEY=VALUE:
while IFS= read -r _line; do
  case "$_line" in ''|\#*) continue ;; esac
  export "$_line" 2>/dev/null || true
done < .env
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.vn}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
DEMO_USER_EMAIL="${DEMO_USER_EMAIL:-user@demo.vn}"
DEMO_USER_PASSWORD="${DEMO_USER_PASSWORD:-Demo#2026}"
NOTIFY_SVC_EMAIL="${NOTIFY_SERVICE_ACCOUNT_EMAIL:-notification-svc@ecommerce.local}"
NOTIFY_SVC_PASSWORD="${NOTIFY_SERVICE_ACCOUNT_PASSWORD:-NotifySvc#2026}"
MAU_SO="${INVOICE_MAU_SO:-01/001}"; KY_HIEU="${INVOICE_KY_HIEU:-C26}"
YEAR=$(date +%Y)
PSQL_ID="docker compose exec -T postgres psql -U ${POSTGRES_USER:-postgres} -d db_identity -tAc"
PSQL_ORD="docker compose exec -T postgres psql -U ${POSTGRES_USER:-postgres} -d db_ordering -tAc"
PSQL_CAT="docker compose exec -T postgres psql -U ${POSTGRES_USER:-postgres} -d db_catalog -tAc"

log() { printf '\033[36m[seed]\033[0m %s\n' "$*"; }

api_post() { # $1 path $2 json $3 token?
  if [ -n "${3:-}" ]; then
    curl -sf -m 10 -X POST "http://localhost:8080$1" -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $3" -d "$2" || return 1
  else
    curl -s -m 10 -X POST "http://localhost:8080$1" -H 'Content-Type: application/json' -d "$2"
  fi
}

curl -sf -m 3 http://localhost:8080/actuator/health >/dev/null || {
  echo "✗ gateway :8080 chưa sống — chạy \`make dev\` trước"; exit 1; }

# ── 1. Accounts qua API + promote role bằng SQL ──────────────────────────────
register_or_login() { # $1 email $2 password
  local res
  res=$(api_post /api/identity/auth/register "{\"email\":\"$1\",\"password\":\"$2\",\"fullName\":\"$3\"}" 2>/dev/null) \
    || res=""
  # login luôn (register thành công cũng auto-login ở một số flow — gọi lại cho chắc)
  api_post /api/identity/auth/login "{\"email\":\"$1\",\"password\":\"$2\"}"
}

log "admin ${ADMIN_EMAIL}…"
ADMIN_TOKEN=$(register_or_login "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "Admin Demo" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")
[ -n "$ADMIN_TOKEN" ] || { echo "✗ admin login fail — kiểm ADMIN_EMAIL/ADMIN_PASSWORD"; exit 1; }

log "demo user ${DEMO_USER_EMAIL}…"
register_or_login "$DEMO_USER_EMAIL" "$DEMO_USER_PASSWORD" "Nguyen Van Demo" >/dev/null

log "notification service-account + promote ADMIN…"
register_or_login "$NOTIFY_SVC_EMAIL" "$NOTIFY_SVC_PASSWORD" "Notification Service" >/dev/null
$PSQL_ID "UPDATE users SET role='ADMIN' WHERE email IN ('$ADMIN_EMAIL','$NOTIFY_SVC_EMAIL');" >/dev/null
log "roles OK (admin + notification-svc = ADMIN)"

# ── 2. Coupons pack-correct (schema-level nguồn = V14__seed_coupons_repair.sql;
# block này giữ đồng bộ 1:1 với V14 — seed runtime cho volume đã migrate) ────
$PSQL_ORD "INSERT INTO coupons (code,type,value,min_order_value,starts_at,ends_at,usage_limit,active,description)
VALUES
 ('WELCOME10','PERCENT',10,100000,now(),now()+interval '30 days',100,TRUE,'Giảm 10% tối đa đơn 100.000d — hạn 30 ngày'),
 ('GIAM50K','FIXED',50000,500000,now(),NULL,100,TRUE,'Giảm 50.000d cho đơn từ 500.000d')
ON CONFLICT (code) DO UPDATE SET
 value=EXCLUDED.value, min_order_value=EXCLUDED.min_order_value, ends_at=EXCLUDED.ends_at,
 usage_limit=EXCLUDED.usage_limit, active=TRUE;"
log "coupons OK (WELCOME10 10%/limit100/+30d · GIAM50K 50k)"

# ── 3. Verify catalog seed + flash +2 ngày (SF-4 SeedDataRunner) ─────────────
PRODUCT_COUNT=$($PSQL_CAT "SELECT count(*) FROM products;")
FLASH_COUNT=$($PSQL_CAT "SELECT count(*) FROM products WHERE flash_sale_ends_at > now();")
log "catalog: $PRODUCT_COUNT products, $FLASH_COUNT flash đang chạy (+2 ngày từ boot)"

# ── 4. Orders CONFIRMED (guard idempotent: demo user chưa có đơn) ────────────
USER_ID=$($PSQL_ID "SELECT id FROM users WHERE email='$DEMO_USER_EMAIL';")
EXISTING=$($PSQL_ORD "SELECT count(*) FROM orders WHERE user_id='$USER_ID';" | tr -d ' ')
if [ "${EXISTING:-0}" -ge 2 ]; then
  log "orders đã seed ($EXISTING) — skip"
else
  # product/variant thật từ db_catalog (tên pin trong seed SF-4) — -F ' ' để read tách
  psql_cat_fs() { docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d db_catalog -tA -F ' ' -c "$1"; }
  read -r PID1 VID1 PRICE1 SLUG1 < <(psql_cat_fs "SELECT p.id, v.id, COALESCE(v.price, p.price), p.slug_vi FROM products p JOIN LATERAL (SELECT id, price FROM product_variants WHERE product_id=p.id LIMIT 1) v ON TRUE WHERE p.name->>'vi' ILIKE 'Áo thun%' LIMIT 1;")
  read -r PID2 VID2 PRICE2 SLUG2 < <(psql_cat_fs "SELECT p.id, v.id, COALESCE(v.price, p.price), p.slug_vi FROM products p JOIN LATERAL (SELECT id, price FROM product_variants WHERE product_id=p.id LIMIT 1) v ON TRUE WHERE p.name->>'vi' ILIKE 'Áo sơ mi%' LIMIT 1;")
  [ -n "${PID1:-}" ] && [ -n "${PID2:-}" ] || { echo "✗ không tìm thấy product seed (Tai nghe/Áo thun)"; exit 1; }

  # cấp 2 số hóa đơn tuần tự (khớp INVOICE_MAU_SO/KY_HIEU)
  psql_ord_fs() { docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d db_ordering -tA -F ' ' -c "$1"; }
  read -r INV1 INV2 < <(psql_ord_fs "INSERT INTO invoice_sequences (mau_so,ky_hieu,year,last_number,updated_at) VALUES ('$MAU_SO','$KY_HIEU',$YEAR,2,now()) ON CONFLICT (mau_so,ky_hieu,year) DO UPDATE SET last_number = invoice_sequences.last_number + 2, updated_at=now() RETURNING last_number - 1, last_number;")

  NAME1=$(psql_cat_fs "SELECT name->>'vi' FROM products WHERE id='$PID1';")
  NAME2=$(psql_cat_fs "SELECT name->>'vi' FROM products WHERE id='$PID2';")
  ADDR='{"fullName":"Nguyen Van Demo","phone":"0901234567","line1":"12 Nguyen Hue","ward":"Ben Nghe","district":"Quan 1","city":"TP. Hồ Chí Minh"}'
  NOW1=$(date -u +%Y-%m-%dT%H:%M:%SZ); NOW2=$(date -u -v-2d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '2 days ago' +%Y-%m-%dT%H:%M:%SZ)
  # timeline ISO tường minh (pattern-replace \$N không match — literal $N
  # lọt vào jsonb → Hibernate timeline deserialize vỡ admin orders — live-verify r5)
  TL1=$(printf '[{"status":"PENDING","at":"%s"},{"status":"PAID","at":"%s"},{"status":"CONFIRMED","at":"%s"}]' "$NOW1" "$NOW1" "$NOW1")
  TL2=$(printf '[{"status":"PENDING","at":"%s"},{"status":"PAID","at":"%s"},{"status":"CONFIRMED","at":"%s"}]' "$NOW2" "$NOW2" "$NOW2")
  O1=$(uuidgen); O2=$(uuidgen)
  SUB1=$((PRICE1 * 1)); TOT1=$((SUB1 + 25000 - SUB1 / 10))
  SUB2=$((PRICE2 * 2)); TOT2=$((SUB2 + 25000))

  # đơn 1: có WELCOME10 (FINALIZED — used_count đã tính), hôm nay
  $PSQL_ORD "BEGIN;
  INSERT INTO orders (id,user_id,email,status,subtotal,discount,shipping_fee,total,currency,coupon_code,
    payment_method,shipping_method,address,timeline,idempotency_key,payload_hash,invoice_number,invoice_issued_at)
  VALUES ('$O1','$USER_ID','$DEMO_USER_EMAIL','CONFIRMED',$SUB1,$((SUB1/10)),25000,$TOT1,'VND','WELCOME10',
    'stripe','standard','$ADDR','$TL1', 'seed-$O1','seed', $INV1, now());
  INSERT INTO order_items (id,order_id,product_id,variant_id,name,unit_price,qty,line_total)
  VALUES (gen_random_uuid(),'$O1','$PID1','$VID1','$NAME1',$PRICE1,1,$SUB1);
  INSERT INTO saga_state (order_id,step) VALUES ('$O1','DONE');
  UPDATE coupons SET used_count = used_count + 1 WHERE code='WELCOME10';
  INSERT INTO coupon_reservations (id,order_id,coupon_code,status) VALUES (gen_random_uuid(),'$O1','WELCOME10','FINALIZED');
  COMMIT;" >/dev/null
  # đơn 2: không coupon, 2 ngày trước (dashboard revenue-by-day có 2 điểm)
  $PSQL_ORD "BEGIN;
  INSERT INTO orders (id,user_id,email,status,subtotal,discount,shipping_fee,total,currency,
    payment_method,shipping_method,address,timeline,idempotency_key,payload_hash,invoice_number,invoice_issued_at,created_at,updated_at)
  VALUES ('$O2','$USER_ID','$DEMO_USER_EMAIL','CONFIRMED',$SUB2,0,25000,$TOT2,'VND',
    'stripe','standard','$ADDR','$TL2', 'seed-$O2','seed', $INV2, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days');
  INSERT INTO order_items (id,order_id,product_id,variant_id,name,unit_price,qty,line_total)
  VALUES (gen_random_uuid(),'$O2','$PID2','$VID2','$NAME2',$PRICE2,2,$SUB2);
  INSERT INTO saga_state (order_id,step) VALUES ('$O2','DONE');
  COMMIT;" >/dev/null

  # verified-purchase eligibility cho review (đơn 1 mua tai nghe)
  $PSQL_CAT "INSERT INTO review_eligibility (user_id,product_id,order_id) VALUES ('$USER_ID','$PID1','$O1')
    ON CONFLICT (user_id,product_id) DO NOTHING;" >/dev/null
  log "orders CONFIRMED OK: 2 đơn (invoice #$INV1 #$INV2 — $MAU_SO $KY_HIEU/$YEAR)"
fi

# verified-purchase eligibility cho REVIEW product (Tai nghe — review-flow
# E2E viết review trên này; eligibility theo order product sẽ thiếu khi đơn
# seed là áo thun — live-verify r5). ĐẶT NGOÀI guard orders — idempotent.
TAI_NGHE_PID=$($PSQL_CAT "SELECT id FROM products WHERE name->>'vi' ILIKE 'Tai nghe%' LIMIT 1;" | tr -d ' ')
if [ -n "$TAI_NGHE_PID" ] && [ -n "${USER_ID:-}" ]; then
  REF_ORDER=$($PSQL_ORD "SELECT id FROM orders WHERE user_id='$USER_ID' LIMIT 1;" | tr -d ' ')
  $PSQL_CAT "INSERT INTO review_eligibility (user_id,product_id,order_id) VALUES ('$USER_ID','$TAI_NGHE_PID','$REF_ORDER')
    ON CONFLICT (user_id,product_id) DO NOTHING;" >/dev/null
  log "review eligibility OK (tai nghe — user@demo.vn)"
fi

# ── 5. 1 review APPROVED (verified) — idempotent theo unique (user,product) ──
REVIEW_EXISTS=$($PSQL_CAT "SELECT count(*) FROM reviews WHERE status='APPROVED' AND verified=TRUE;" | tr -d ' ')
if [ "${REVIEW_EXISTS:-0}" -eq 0 ]; then
  $PSQL_CAT "INSERT INTO reviews (id,product_id,user_id,user_name,rating,title,content,status,verified)
  SELECT gen_random_uuid(), p.id, u.uid, 'Nguyen Van Demo', 5,
    'Âm hay, đeo êm', 'Đã mua qua demo — đúng như mô tả, pin trâu. Sẽ ủng hộ tiếp.', 'APPROVED', TRUE
  FROM (SELECT id product_id FROM products WHERE name->>'vi' ILIKE 'Tai nghe%' LIMIT 1) p
  CROSS JOIN (SELECT '$USER_ID'::uuid uid) u
  ON CONFLICT (user_id, product_id) DO NOTHING;
  UPDATE products SET rating_avg = 5.0, rating_count = 1
  WHERE id = (SELECT product_id FROM reviews WHERE status='APPROVED' AND verified=TRUE LIMIT 1);"
  log "review APPROVED (verified) OK"
else
  log "review APPROVED đã có — skip"
fi

# ── 5b. Inventory stock cho MỌI variant (SF-5 không có seed runner — volume
# mới/purgeable reset để stocks rỗng → mọi POST /orders fail 409 insufficient).
# quantity 50/variant — đủ demo golden path + saga fail. Đọc variant từ
# db_catalog (cross-DB không JOIN được — fetch qua bash, insert từng row,
# ON CONFLICT idempotent).
docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d db_catalog -tAc \
  "SELECT id::text || '|' || COALESCE(product_id::text,'') || '|' || COALESCE(name_i18n->>'vi','') FROM product_variants;" > /tmp/seed-variants.$$ || true
while IFS='|' read -r VIDX PIDX NAMEX; do
  [ -n "$VIDX" ] || continue
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d db_inventory -tAc \
    "INSERT INTO stocks (variant_id, quantity, threshold_low, product_id, product_name)
     VALUES ('$VIDX', 50, 10, NULLIF('$PIDX',''), NULLIF('$NAMEX',''))
     ON CONFLICT (variant_id) DO UPDATE SET
       quantity = 50, threshold_low = 10,
       product_name = COALESCE(NULLIF('$NAMEX',''), stocks.product_name);" >/dev/null < /dev/null
done < /tmp/seed-variants.$$
rm -f /tmp/seed-variants.$$
STOCK_COUNT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d db_inventory -tAc "SELECT count(*) FROM stocks;" | tr -d ' ')
log "inventory stocks OK ($STOCK_COUNT variant × 50)"

# ── 6. Partner Open API demo key (deterministic — E2E §5.13) ────────────────
# Raw key cố định (chỉ dùng dev/test): pk_ + 32 hex. DB giữ SHA-256 hash +
# prefix 8 ký tự đầu (khớp ApiKeyService: raw KHÔNG lưu). PartnerSeedRunner
# (SF-11) tạo DEMO-PARTNER — nếu chưa có (volume mới, service chưa boot) thì
# script tự tạo partner row luôn cho idempotent tuyệt đối.
PARTNER_KEY_RAW="pk_0123456789abcdef0123456789abcdef"
PARTNER_KEY_HASH=$(printf '%s' "$PARTNER_KEY_RAW" | shasum -a 256 | cut -d' ' -f1)
PARTNER_KEY_PREFIX="${PARTNER_KEY_RAW:0:8}"
PSQL_PARTNER="docker compose exec -T postgres psql -U ${POSTGRES_USER:-postgres} -d db_partner -tAc"
$PSQL_PARTNER "INSERT INTO partners (id,name,status,webhook_url,webhook_secret)
SELECT '11111111-1111-4111-8111-111111111111','DEMO-PARTNER','ACTIVE','https://webhook.demo/v1','demo-webhook-secret'
WHERE NOT EXISTS (SELECT 1 FROM partners WHERE name='DEMO-PARTNER') ON CONFLICT (id) DO NOTHING;" >/dev/null
$PSQL_PARTNER "INSERT INTO api_keys (id,partner_id,key_hash,prefix,scopes)
SELECT '22222222-2222-4222-8222-222222222222',
  (SELECT id FROM partners WHERE name='DEMO-PARTNER'),
  '$PARTNER_KEY_HASH','$PARTNER_KEY_PREFIX','{catalog:read,orders:read,orders:write}'
ON CONFLICT (id) DO NOTHING;" >/dev/null
log "partner demo key OK (raw: $PARTNER_KEY_RAW — E2E §5.13 dùng key này)"

log "XONG — accounts: admin $ADMIN_EMAIL / user $DEMO_USER_EMAIL (password từ .env)"
log "      affiliate demo: xem docs/demo-script.md §affiliate"
