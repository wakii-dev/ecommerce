# QA Static Audit — SF-1 (FI-405)

> Report marker-based: MỖI script regen block `<!-- sf1:<section> -->` của mình
> (read → replace → write, idempotent re-run). Block do script sinh — KHÔNG sửa tay.
> config-audit.mjs: summary + axis-a/b/c · s2s-auth-matrix.mjs: s2s ·
> rbac-matrix.mjs: rbac · contracts-freshness.mjs: contracts.
> Exit semantics chung 4 script: 0 = 0 finding CHƯA fix · 1 = ≥1 finding CHƯA fix · 2 = script error.

<!-- sf1:summary -->
**config-audit** run 2026-09-10 06:57:24 UTC — compose `docker-compose.yml` · backend `backend`

| Trục | Kiểm | DANGEROUS | UNFIXED | FIXED (registry) | WARN (non-finding) |
| --- | --- | --- | --- | --- | --- |
| (a) env var | 220 | 1 | 0 | 1 | 13 |
| (b) volume mount | 8 | 1 | 0 | 1 | — |
| (c) compose checklist | 3 | 0 | 0 | 0 | 2 |

**Exit config-audit: `0`** — legend: `0` = 0 finding CHƯA fix · `1` = ≥1 finding CHƯA fix · `2` = script error. Tổng unfixed: **0** (finding ID `CFG-xx`; FIXED registry `scripts/qa/config-audit-fixed.json`).

> Bảng exit ĐỦ 4 script (config-audit · s2s · rbac · contracts) do recipe `make qa-audit` ghi
> vào block này SAU KHI đủ 4 exit — script standalone KHÔNG biết exit của script khác.
<!-- make:exit-table -->
**Exit-table 4 script (ghi bởi recipe make qa-audit sau khi đủ 4 script chạy — script standalone không biết exit nhau):**

| script | exit |
| --- | --- |
| config-audit | 0 |
| s2s-auth-matrix | 0 |
| rbac-matrix | 0 |
| contracts-freshness | 0 |

Exit tổng (max): **0** — legend: 0 = 0 unfixed finding · 1 = có finding chưa fix · 2 = script error. (GNU make bọc recipe-fail → exit tiến trình make luôn 2 khi ≠ 0 — exit-tổng THẬT là số này + dòng Error N của make.)
<!-- /make:exit-table --><!-- /sf1:summary -->

<!-- sf1:axis-a -->
### Trục (a) — env var code ↔ compose (A1)

Đối chiếu 220 env-var. Trạng thái: UNSET=135 · OK=46 · SEE-AXIS-B=7 · WARN=13 · SKIP-FE=8 · FIXED=1 · SET-EMPTY=2 · SKIP-NOENTRY=8. WARN/UNSET/SKIP **không phải finding**.

**Findings DANGEROUS:**

| ID | service | var | ghi chú | evidence |
| --- | --- | --- | --- | --- |
| CFG-A-identity-service-IDENTITY_OAUTH_PUBLIC_BASE_URL | identity-service | IDENTITY_OAUTH_PUBLIC_BASE_URL | default http://localhost:8080 trỏ localhost — container không tới được (pattern LOG_URI 9/9) | backend/services/identity-service/src/main/resources/application.yml:50 · compose không set IDENTITY_OAUTH_PUBLIC_BASE_… |

**WARN (non-finding, không ảnh hưởng exit):**

| service | var | compose | ghi chú |
| --- | --- | --- | --- |
| affiliate-service | SECURITY_JWKS_URI | http://identity-service:8081/.well-know… | set http://identity-service:8081/.well-known/jwks.json — host là compose service nhưng lệch port (— → 8081) —… |
| affiliate-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_affi… | set jdbc:postgresql://postgres:5432/db_affiliate — host là compose service nhưng lệch port (5433 → 5432) — WA… |
| catalog-service | CATALOG_MINIO_ENABLED | true | set true khác default false — giá trị vô hướng (scalar, không host/port) — WARN non-finding |
| catalog-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_cata… | set jdbc:postgresql://postgres:5432/db_catalog — host là compose service nhưng lệch port (5433 → 5432) — WARN… |
| gateway | IDENTITY_JWKS_URI | http://identity-service:8081/.well-know… | set http://identity-service:8081/.well-known/jwks.json — host là compose service nhưng lệch port (8080 → 8081… |
| gateway | SPRING_PROFILES_ACTIVE | full | set full khác default dev — giá trị vô hướng (scalar, không host/port) — WARN non-finding |
| identity-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_iden… | set jdbc:postgresql://postgres:5432/db_identity — host là compose service nhưng lệch port (5433 → 5432) — WAR… |
| inventory-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_inve… | set jdbc:postgresql://postgres:5432/db_inventory — host là compose service nhưng lệch port (5433 → 5432) — WA… |
| notification-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_noti… | set jdbc:postgresql://postgres:5432/db_notification — host là compose service nhưng lệch port (5433 → 5432) —… |
| ordering-service | IDENTITY_JWKS_URI | http://identity-service:8081/.well-know… | set http://identity-service:8081/.well-known/jwks.json — host là compose service nhưng lệch port (8080 → 8081… |
| ordering-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_orde… | set jdbc:postgresql://postgres:5432/db_ordering — host là compose service nhưng lệch port (5433 → 5432) — WAR… |
| partner-api | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_part… | set jdbc:postgresql://postgres:5432/db_partner — host là compose service nhưng lệch port (5433 → 5432) — WARN… |
| payment-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_paym… | set jdbc:postgresql://postgres:5432/db_payment — host là compose service nhưng lệch port (5433 → 5432) — WARN… |

**Bảng đầy đủ** (default/compose masked theo policy secret; SKIP-NOENTRY=8 var của service không có entry compose — lược):

| service | var | status | default | compose |
| --- | --- | --- | --- | --- |
| affiliate-service | AFFILIATE_CLICK_DEDUPE_MINUTES | UNSET | 10 | (không default) |
| affiliate-service | AFFILIATE_COOKIE_MAX_AGE | UNSET | 2592000 | (không default) |
| affiliate-service | AFFILIATE_DEFAULT_RATE | OK | 5 | 5 |
| affiliate-service | AFFILIATE_INTERNAL_TOKEN | UNSET | «masked» | (không default) |
| affiliate-service | AFFILIATE_IP_SALT | UNSET | dev-affiliate-salt | (không default) |
| affiliate-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | /keys/jwt-public.pem |
| affiliate-service | LOYALTY_EARN_RATE | UNSET | 1 | (không default) |
| affiliate-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| affiliate-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| affiliate-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| affiliate-service | RABBITMQ_USER | UNSET | guest | (không default) |
| affiliate-service | SECURITY_JWKS_URI | WARN | (rỗng) | http://identity-service:8081/.well-known/jwks.json |
| affiliate-service | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| affiliate-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_affiliate | jdbc:postgresql://postgres:5432/db_affiliate |
| affiliate-service | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| affiliate-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| cart-service | CART_ABANDONED_ENABLED | UNSET | true | (không default) |
| cart-service | CART_ABANDONED_FLAG_TTL_HOURS | UNSET | 24 | (không default) |
| cart-service | CART_ABANDONED_IDLE_MINUTES | UNSET | 120 | (không default) |
| cart-service | CART_ABANDONED_SWEEP_INTERVAL_MS | UNSET | 60000 | (không default) |
| cart-service | CART_TTL_DAYS | UNSET | 30 | (không default) |
| cart-service | CATALOG_BASE_URL | OK | http://localhost:8082 | http://catalog-service:8082 |
| cart-service | INVENTORY_BASE_URL | OK | http://localhost:8084 | http://inventory-service:8084 |
| cart-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | /keys/jwt-public.pem |
| cart-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| cart-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| cart-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| cart-service | RABBITMQ_USER | UNSET | guest | (không default) |
| cart-service | REDIS_HOST | OK | localhost | redis |
| cart-service | REDIS_PORT | UNSET | 6379 | (không default) |
| cart-service | SECURITY_JWKS_URI | UNSET | (rỗng) | (không default) |
| cart-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| catalog-service | CATALOG_INTERNAL_TOKEN | UNSET | «masked» | (không default) |
| catalog-service | CATALOG_MINIO_ENABLED | WARN | false | true |
| catalog-service | CATALOG_MINIO_ENDPOINT | OK | http://localhost:9000 | http://minio:9000 |
| catalog-service | ELASTICSEARCH_URI | OK | http://localhost:9200 | http://elasticsearch:9200 |
| catalog-service | INVENTORY_BASE_URL | OK | http://localhost:8084 | http://inventory-service:8084 |
| catalog-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | /keys/jwt-public.pem |
| catalog-service | MINIO_ROOT_PASSWORD | UNSET | «masked» | (không default) |
| catalog-service | MINIO_ROOT_USER | UNSET | «masked» | (không default) |
| catalog-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| catalog-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| catalog-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| catalog-service | RABBITMQ_USER | UNSET | guest | (không default) |
| catalog-service | REDIS_HOST | OK | localhost | redis |
| catalog-service | REDIS_PORT | UNSET | 6379 | (không default) |
| catalog-service | SECURITY_JWKS_URI | UNSET | (rỗng) | (không default) |
| catalog-service | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| catalog-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_catalog | jdbc:postgresql://postgres:5432/db_catalog |
| catalog-service | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| catalog-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| gateway | AFFILIATE_URI | OK | http://localhost:8092 | http://affiliate-service:8092 |
| gateway | CART_URI | OK | http://localhost:8083 | http://cart-service:8083 |
| gateway | CATALOG_URI | OK | http://localhost:8082 | http://catalog-service:8082 |
| gateway | IDENTITY_JWKS_URI | WARN | http://localhost:8080/api/identity/.well-known/jwks.json | http://identity-service:8081/.well-known/jwks.json |
| gateway | IDENTITY_URI | OK | http://localhost:8081 | http://identity-service:8081 |
| gateway | INVENTORY_URI | OK | http://localhost:8084 | http://inventory-service:8084 |
| gateway | LOG_URI | OK | http://localhost:8088 | http://log-service:8088 |
| gateway | MINIO_URI | OK | http://localhost:9000 | http://minio:9000 |
| gateway | NOTIFICATION_URI | OK | http://localhost:8087 | http://notification-service:8087 |
| gateway | ORDERING_URI | OK | http://localhost:8085 | http://ordering-service:8085 |
| gateway | PARTNER_API_URI | OK | http://localhost:8091 | http://partner-api:8091 |
| gateway | PAYMENT_URI | OK | http://localhost:8086 | http://payment-service:8086 |
| gateway | SHELL_WEB_ORIGIN | SKIP-FE | http://localhost:5173 | http://frontend-web:80 |
| gateway | SPRING_PROFILES_ACTIVE | WARN | dev | full |
| gateway | STOREFRONT_WEB_URI | SKIP-FE | http://localhost:3000 | http://storefront-web:3000 |
| identity-service | ADMIN_EMAIL | UNSET | (rỗng) | (không default) |
| identity-service | ADMIN_PASSWORD | UNSET | (rỗng) | (không default) |
| identity-service | IDENTITY_2FA_KEY | UNSET | (rỗng) | (không default) |
| identity-service | IDENTITY_COOKIE_PATH | UNSET | /api/identity | (không default) |
| identity-service | IDENTITY_OAUTH_FE_REDIRECT_BASE | SKIP-FE | http://localhost:5173 | (không default) |
| identity-service | IDENTITY_OAUTH_PUBLIC_BASE_URL | FIXED | http://localhost:8080 | (không default) |
| identity-service | IDENTITY_REFRESH_TTL_DAYS | UNSET | 30 | (không default) |
| identity-service | JWT_ACCESS_TTL_SECONDS | UNSET | 900 | (không default) |
| identity-service | JWT_KID | UNSET | identity-1 | (không default) |
| identity-service | JWT_PRIVATE_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-private.pem | /keys/jwt-private.pem |
| identity-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | /keys/jwt-public.pem |
| identity-service | OAUTH_FACEBOOK_AUTHORIZE_URI | UNSET | https://www.facebook.com/v19.0/dialog/oauth | (không default) |
| identity-service | OAUTH_FACEBOOK_CLIENT_ID | UNSET | (rỗng) | (không default) |
| identity-service | OAUTH_FACEBOOK_CLIENT_SECRET | UNSET | (rỗng) | (không default) |
| identity-service | OAUTH_FACEBOOK_TOKEN_URI | UNSET | «masked» | (không default) |
| identity-service | OAUTH_FACEBOOK_USERINFO_URI | UNSET | https://graph.facebook.com/v19.0/me?fields=id,name,email | (không default) |
| identity-service | OAUTH_GOOGLE_AUTHORIZE_URI | UNSET | https://accounts.google.com/o/oauth2/v2/auth | (không default) |
| identity-service | OAUTH_GOOGLE_CLIENT_ID | UNSET | (rỗng) | (không default) |
| identity-service | OAUTH_GOOGLE_CLIENT_SECRET | UNSET | (rỗng) | (không default) |
| identity-service | OAUTH_GOOGLE_TOKEN_URI | UNSET | «masked» | (không default) |
| identity-service | OAUTH_GOOGLE_USERINFO_URI | UNSET | https://openidconnect.googleapis.com/v1/userinfo | (không default) |
| identity-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| identity-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| identity-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| identity-service | RABBITMQ_USER | UNSET | guest | (không default) |
| identity-service | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| identity-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_identity | jdbc:postgresql://postgres:5432/db_identity |
| identity-service | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| identity-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| inventory-service | INVENTORY_LOW_STOCK_THRESHOLD | UNSET | 10 | (không default) |
| inventory-service | INVENTORY_MAX_TTL_MINUTES | UNSET | 60 | (không default) |
| inventory-service | INVENTORY_SWEEP_INTERVAL_MS | UNSET | 30000 | (không default) |
| inventory-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | /keys/jwt-public.pem |
| inventory-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| inventory-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| inventory-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| inventory-service | RABBITMQ_USER | UNSET | guest | (không default) |
| inventory-service | SECURITY_JWKS_URI | UNSET | (rỗng) | (không default) |
| inventory-service | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| inventory-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_inventory | jdbc:postgresql://postgres:5432/db_inventory |
| inventory-service | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| inventory-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| log-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | /keys/jwt-public.pem |
| log-service | MONGO_DATABASE | OK | db_log | db_log |
| log-service | MONGO_URI | OK | mongodb://localhost:27017 | mongodb://mongo:27017 |
| log-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| log-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| log-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| log-service | RABBITMQ_USER | UNSET | guest | (không default) |
| log-service | SECURITY_JWKS_URI | UNSET | (rỗng) | (không default) |
| log-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| notification-service | CATALOG_INTERNAL_TOKEN | UNSET | «masked» | (không default) |
| notification-service | MAIL_HOST | OK | localhost | mailpit |
| notification-service | MAIL_PORT | OK | 1025 | 1025 |
| notification-service | NOTIFY_CART_URL | SKIP-FE | http://localhost:5173/cart | (không default) |
| notification-service | NOTIFY_COUPON_CENTER_URL | SKIP-FE | http://localhost:3000/coupons | (không default) |
| notification-service | NOTIFY_IDENTITY_BASE_URL | OK | http://localhost:8081 | http://identity-service:8081 |
| notification-service | NOTIFY_IDENTITY_TIMEOUT_MS | UNSET | 5000 | (không default) |
| notification-service | NOTIFY_MAIL_FROM | UNSET | Ecommerce Demo <no-reply@demo.vn> | (không default) |
| notification-service | NOTIFY_MY_ORDERS_URL | SKIP-FE | http://localhost:5173/account/orders | http://localhost:8080/account/orders |
| notification-service | NOTIFY_ORDERING_TIMEOUT_MS | UNSET | 10000 | (không default) |
| notification-service | NOTIFY_RESET_PASSWORD_URL | SKIP-FE | «masked» | (không default) |
| notification-service | NOTIFY_SERVICE_ACCOUNT_EMAIL | OK | notification-svc@ecommerce.local | notification-svc@ecommerce.local |
| notification-service | NOTIFY_SERVICE_ACCOUNT_PASSWORD | OK | «masked» | «masked» |
| notification-service | NOTIFY_STOCK_ALERT_CATALOG_BASE_URL | OK | http://localhost:8082 | http://catalog-service:8082 |
| notification-service | NOTIFY_STOCK_ALERT_ENABLED | UNSET | true | (không default) |
| notification-service | NOTIFY_STOCK_ALERT_INITIAL_DELAY_MS | UNSET | 5000 | (không default) |
| notification-service | NOTIFY_STOCK_ALERT_INTERVAL_MS | UNSET | 60000 | (không default) |
| notification-service | NOTIFY_STOCK_ALERT_STOREFRONT_URL | SKIP-FE | http://localhost:3000 | (không default) |
| notification-service | ORDERING_BASE_URL | OK | http://localhost:8085 | http://ordering-service:8085 |
| notification-service | POSTGRES_PASSWORD | UNSET | «masked» | (không default) |
| notification-service | POSTGRES_USER | UNSET | postgres | (không default) |
| notification-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| notification-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| notification-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| notification-service | RABBITMQ_USER | UNSET | guest | (không default) |
| notification-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_notification | jdbc:postgresql://postgres:5432/db_notification |
| notification-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| ordering-service | AFFILIATE_BASE_URL | OK | http://localhost:8092 | http://affiliate-service:8092 |
| ordering-service | AFFILIATE_INTERNAL_TOKEN | UNSET | «masked» | (không default) |
| ordering-service | AFFILIATE_TIMEOUT_MS | UNSET | 5000 | (không default) |
| ordering-service | CATALOG_API_TOKEN | UNSET | (rỗng) | (không default) |
| ordering-service | CATALOG_BASE_URL | OK | http://localhost:8082 | http://catalog-service:8082 |
| ordering-service | CATALOG_BY_ID_PATH | UNSET | /api/catalog/products/by-id/ | (không default) |
| ordering-service | CATALOG_TIMEOUT_MS | UNSET | 5000 | (không default) |
| ordering-service | GHN_API_URL | UNSET | https://dev-online-gateway.ghn.vn | (không default) |
| ordering-service | GHN_FROM_DISTRICT_ID | UNSET | 1454 | (không default) |
| ordering-service | GHN_SHOP_ID | UNSET | (rỗng) | (không default) |
| ordering-service | GHN_TIMEOUT_MS | UNSET | 5000 | (không default) |
| ordering-service | GHN_TOKEN | UNSET | (rỗng) | (không default) |
| ordering-service | IDENTITY_JWKS_URI | WARN | http://localhost:8080/api/identity/.well-known/jwks.json | http://identity-service:8081/.well-known/jwks.json |
| ordering-service | INVENTORY_BASE_URL | OK | http://localhost:8084 | http://inventory-service:8084 |
| ordering-service | INVENTORY_TIMEOUT_MS | UNSET | 5000 | (không default) |
| ordering-service | INVOICE_KY_HIEU | UNSET | C26 | (không default) |
| ordering-service | INVOICE_MAU_SO | UNSET | 01/001 | (không default) |
| ordering-service | INVOICE_SELLER_ADDRESS | UNSET | 123 Đường Thử Nghiệm, Phường Bến Nghé, Quận 1, TP. Hồ Chí M… | (không default) |
| ordering-service | INVOICE_SELLER_NAME | UNSET | Cửa hàng Demo Ecommerce | (không default) |
| ordering-service | INVOICE_SELLER_PHONE | UNSET | 028 1234 5678 | (không default) |
| ordering-service | INVOICE_SELLER_TAX_ID | UNSET | 0312345678 | (không default) |
| ordering-service | INVOICE_SERVICE_URL | OK | http://localhost:8090 | http://invoice-service:8090 |
| ordering-service | INVOICE_TIMEOUT_MS | UNSET | 8000 | (không default) |
| ordering-service | INVOICE_VAT_RATE | UNSET | 10 | (không default) |
| ordering-service | ORDERING_SWEEP_INTERVAL_MS | UNSET | 30000 | (không default) |
| ordering-service | ORDERING_TTL_CANCEL_SECONDS | UNSET | 2100 | (không default) |
| ordering-service | PAYMENT_BASE_URL | OK | http://localhost:8086 | http://payment-service:8086 |
| ordering-service | PAYMENT_TIMEOUT_MS | UNSET | 8000 | (không default) |
| ordering-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| ordering-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| ordering-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| ordering-service | RABBITMQ_USER | UNSET | guest | (không default) |
| ordering-service | RMA_WINDOW_DAYS | UNSET | 7 | (không default) |
| ordering-service | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| ordering-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_ordering | jdbc:postgresql://postgres:5432/db_ordering |
| ordering-service | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| ordering-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| partner-api | PARTNER_CATALOG_BASE_URL | OK | http://localhost:8082 | http://catalog-service:8082 |
| partner-api | PARTNER_CATALOG_TIMEOUT_MS | UNSET | 5000 | (không default) |
| partner-api | PARTNER_IDENTITY_BASE_URL | OK | http://localhost:8081 | http://identity-service:8081 |
| partner-api | PARTNER_IDENTITY_TIMEOUT_MS | UNSET | 5000 | (không default) |
| partner-api | PARTNER_ORDERING_BASE_URL | OK | http://localhost:8085 | http://ordering-service:8085 |
| partner-api | PARTNER_ORDERING_TIMEOUT_MS | UNSET | 8000 | (không default) |
| partner-api | PARTNER_SERVICE_ACCOUNT_EMAIL | UNSET | partner-svc@ecommerce.local | (không default) |
| partner-api | PARTNER_SERVICE_ACCOUNT_NAME | UNSET | Partner Orders (service account) | (không default) |
| partner-api | PARTNER_SERVICE_ACCOUNT_PASSWORD | UNSET | «masked» | (không default) |
| partner-api | PARTNER_WEBHOOK_MAX_ATTEMPTS | UNSET | 3 | (không default) |
| partner-api | PARTNER_WEBHOOK_RETRY_BASE_MS | UNSET | 5000 | (không default) |
| partner-api | PARTNER_WEBHOOK_SCHEDULER_INTERVAL_MS | UNSET | 5000 | (không default) |
| partner-api | RABBITMQ_HOST | OK | localhost | rabbitmq |
| partner-api | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| partner-api | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| partner-api | RABBITMQ_USER | UNSET | guest | (không default) |
| partner-api | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| partner-api | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_partner | jdbc:postgresql://postgres:5432/db_partner |
| partner-api | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| partner-api | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| payment-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| payment-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| payment-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| payment-service | RABBITMQ_USER | UNSET | guest | (không default) |
| payment-service | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| payment-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_payment | jdbc:postgresql://postgres:5432/db_payment |
| payment-service | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| payment-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| payment-service | STRIPE_BASE_URL | UNSET | https://api.stripe.com | (không default) |
| payment-service | STRIPE_SECRET_KEY | SET-EMPTY | (rỗng) | (rỗng) |
| payment-service | STRIPE_WEBHOOK_SECRET | SET-EMPTY | (rỗng) | (rỗng) |
<!-- /sf1:axis-a -->

<!-- sf1:axis-b -->
### Trục (b) — volume mounts drift (A6)

8 path-requirement (code default + compose env) so container-target volume của chính service.

**Findings DANGEROUS:**

| ID | service | var | ghi chú | evidence |
| --- | --- | --- | --- | --- |
| CFG-B-invoice-service-DejaVuSans.ttf | invoice-service | INVOICE_FONT_PATH | path /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf không thuộc volume target nào (không có) | compose env INVOICE_FONT_PATH (set) · không có volumes |

**Bảng đầy đủ:**

| service | var | path hiệu lực | volume targets | status | ghi chú |
| --- | --- | --- | --- | --- | --- |
| affiliate-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| cart-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| catalog-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| identity-service | JWT_PRIVATE_KEY_PATH | /keys/jwt-private.pem | /keys | OK | /keys/jwt-private.pem thuộc target /keys |
| identity-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| inventory-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| invoice-service | INVOICE_FONT_PATH | /usr/share/fonts/truetype/dejavu/DejaVuSans.t… | — | FIXED | path /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf không thuộc volume target nào (không… |
| log-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
<!-- /sf1:axis-b -->

<!-- sf1:axis-c -->
### Trục (c) — compose value drift, closed checklist (A7)

(1) postgres `max_connections` ≥ 110 · (2) healthcheck per JVM service · (3) flag ngoài bảng KNOWN_FLAGS → WARN.

**Findings DANGEROUS:**

| ID | service | check | ghi chú | evidence |
| --- | --- | --- | --- | --- |
| — | — | — | 0 finding | — |

**Bảng đầy đủ:**

| service | check | status | ghi chú |
| --- | --- | --- | --- |
| minio | flag:console-address | WARN | flag ngoài bảng audit (KNOWN_FLAGS) — WARN non-finding, review tay |
| postgres | max_connections | OK | 300 ≥ 110 |
| stripe-cli | flag:forward-to | WARN | flag ngoài bảng audit (KNOWN_FLAGS) — WARN non-finding, review tay |
<!-- /sf1:axis-c -->

<!-- sf1:s2s -->
### s2s auth matrix — STATIC (A2 · A3 · A5)

Run 2026-09-10 06:57:24 UTC — enumerate tĩnh 24 pair path-granularity (pair := client class × endpoint path; ngưỡng A2 ≥ 23: **ĐẠT**) · 14 client file main-source in-scope · 4 file loại trừ A3 · 9 SecurityConfig parse.

Guard đích = SecurityConfig service ĐÍCH, service-side path (s2s gọi thẳng port service, KHÔNG qua gateway StripPrefix). `permitAll*` = service không SecurityConfig + không spring-security (payment · invoice-Python) — special rule plan-critic: ghi note, KHÔNG GAP. Verdicts: **EXPECTED_OK=24 · DANGEROUS=0 · GAP=0** → exit **0**.

**Findings (S2S-xx — A11 deterministic):**

| ID | verdict | pair | lý do / ghi chú | evidence |
| --- | --- | --- | --- | --- |
| — | — | — | 0 finding | — |

**Matrix đầy đủ (24 pair):**

| client (module) | call | destination | guard đích | token attach | verdict | evidence (client ⟂ guard) |
| --- | --- | --- | --- | --- | --- | --- |
| cart.CatalogEnricher | GET /api/catalog/products/{slug} | catalog-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/cart-service/src/main/java/com/eco… ⟂ SecurityConfig catalog-service:42 — /api/catalog/pr… |
| cart.InventoryChecker | GET /inventory/availability | inventory-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/cart-service/src/main/java/com/eco… ⟂ SecurityConfig inventory-service:44 — /inventory/av… |
| catalog.InventoryAvailabilityClient | GET /inventory/availability | inventory-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/catalog-service/src/main/java/com/… ⟂ SecurityConfig inventory-service:44 — /inventory/av… |
| notification.CatalogStockAlertClient | GET /api/catalog/internal/stock-alerts/candidates | catalog-service | permitAll | X-Internal-Token (controller-side check) | EXPECTED_OK | backend/services/notification-service/src/main/java… ⟂ SecurityConfig catalog-service:51 — /api/catalog/in… |
| notification.CatalogStockAlertClient | POST /api/catalog/internal/stock-alerts/claim | catalog-service | permitAll | X-Internal-Token (controller-side check) | EXPECTED_OK | backend/services/notification-service/src/main/java… ⟂ SecurityConfig catalog-service:51 — /api/catalog/in… |
| notification.IdentityClient | POST /auth/login | identity-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/notification-service/src/main/java… ⟂ SecurityConfig identity-service:47 — /auth/register… |
| notification.IdentityClient | POST /auth/register | identity-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/notification-service/src/main/java… ⟂ SecurityConfig identity-service:47 — /auth/register… |
| notification.InvoiceClient | GET /admin/orders/{id}/invoice | ordering-service | hasRole("ADMIN") | Bearer (service-account ADMIN theo seed) | EXPECTED_OK | backend/services/notification-service/src/main/java… ⟂ SecurityConfig ordering-service:53 — /admin/**, ADM… |
| ordering.HttpCatalogPricingClient | GET /api/catalog/products/by-id/{id} | catalog-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/ordering-service/src/main/java/com… ⟂ SecurityConfig catalog-service:42 — /api/catalog/pr… |
| ordering.HttpInvoiceProvider | POST /api/invoice/generate | invoice-service | permitAll** | không gắn (không cần) | EXPECTED_OK | backend/services/ordering-service/src/main/java/com… ⟂ service ngoài backend/ (Python) — không Spring Secu… |
| ordering.InventoryClient | POST /inventory/reservations | inventory-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/ordering-service/src/main/java/com… ⟂ SecurityConfig inventory-service:46 — /inventory/re… |
| ordering.LoyaltyClient | POST /api/affiliate/internal/loyalty/redeem | affiliate-service | permitAll | X-Internal-Token (controller-side check) | EXPECTED_OK | backend/services/ordering-service/src/main/java/com… ⟂ SecurityConfig affiliate-service:35 — /api/affiliat… |
| ordering.PaymentClient | POST /payment/cod/captures | payment-service | permitAll** | không gắn (không cần) | EXPECTED_OK | backend/services/ordering-service/src/main/java/com… ⟂ payment-service/pom.xml (không spring-security) · k… |
| ordering.PaymentClient | POST /payment/intents | payment-service | permitAll** | không gắn (không cần) | EXPECTED_OK | backend/services/ordering-service/src/main/java/com… ⟂ payment-service/pom.xml (không spring-security) · k… |
| ordering.PaymentClient | POST /payment/refunds | payment-service | permitAll** | không gắn (không cần) | EXPECTED_OK | backend/services/ordering-service/src/main/java/com… ⟂ payment-service/pom.xml (không spring-security) · k… |
| partner.CatalogClient | GET /api/catalog/categories | catalog-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig catalog-service:42 — /api/catalog/pr… |
| partner.CatalogClient | GET /api/catalog/products | catalog-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig catalog-service:42 — /api/catalog/pr… |
| partner.CatalogClient | GET /api/catalog/products/{slug} | catalog-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig catalog-service:42 — /api/catalog/pr… |
| partner.CatalogClient | GET /api/catalog/products/by-id/{id} | catalog-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig catalog-service:42 — /api/catalog/pr… |
| partner.CatalogClient | GET /api/catalog/search | catalog-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig catalog-service:42 — /api/catalog/pr… |
| partner.IdentityClient | POST /auth/login | identity-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig identity-service:47 — /auth/register… |
| partner.IdentityClient | POST /auth/register | identity-service | permitAll | không gắn (không cần) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig identity-service:47 — /auth/register… |
| partner.OrderingClient | GET /me/orders/{id} | ordering-service | authenticated | Bearer (service-account) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig ordering-service:54 — ** |
| partner.OrderingClient | POST /orders | ordering-service | authenticated | Bearer (service-account) | EXPECTED_OK | backend/services/partner-api/src/main/java/com/ecom… ⟂ SecurityConfig ordering-service:54 — ** |

**Loại trừ A3 (4 client file):** `search/EsIndexConfig.java` (infra Elasticsearch (A3)) · `oauth/OAuthProviderClient.java` (third-party OAuth IdP (Google/Facebook) (A3)) · `saga/GhnClient.java` (third-party GHN shipping (A3)) · `webhook/WebhookDeliveryService.java` (third-party partner webhooks).

Drift check: enumerate 24 call-site ↔ curated 24 rows — 1:1 (0 stale, 0 missing).

> Phương pháp: enumerate client = file main-source build/dùng RestClient|WebClient|RestTemplate (file chỉ catch RestClientException KHÔNG phải client). Base-url resolve qua @Value / props-hint constant → port → compose service (A3). Token attach chỉ in TÊN var nguồn («masked» theo policy) + header name — KHÔNG giá trị. Static ≠ runtime: matrix là EXPECTED — live execute là harness SF-2 + triage SF-4.
<!-- /sf1:s2s -->

<!-- sf1:rbac -->
### RBAC expected matrix — closed list (A8)

Run 2026-09-10 06:57:24 UTC — static scan 9 SecurityConfig + @PreAuthorize + controllers. **50 endpoint ADMIN** (12 controllers kỳ vọng: 12/12 thấy + 1 extra ngoài list: inventory-service/InventoryQueryController) × 3 cột EXPECTED: guest→401 · user→403 · admin→2xx. Đóng list — không "...".

**Matrix admin (50 endpoint) — cell = EXPECTED:**

| service | endpoint | controller | guard nguồn | guest | user | admin |
| --- | --- | --- | --- | --- | --- | --- |
| affiliate-service | GET /api/affiliate/admin/affiliates | AdminAffiliateController | SecurityConfig:44 | 401 | 403 | 2xx |
| affiliate-service | POST /api/affiliate/admin/affiliates/{id}/approve | AdminAffiliateController | SecurityConfig:44 | 401 | 403 | 2xx |
| affiliate-service | PUT /api/affiliate/admin/affiliates/{id}/rate | AdminAffiliateController | SecurityConfig:44 | 401 | 403 | 2xx |
| affiliate-service | POST /api/affiliate/admin/affiliates/{id}/reactivate | AdminAffiliateController | SecurityConfig:44 | 401 | 403 | 2xx |
| affiliate-service | POST /api/affiliate/admin/affiliates/{id}/reject | AdminAffiliateController | SecurityConfig:44 | 401 | 403 | 2xx |
| affiliate-service | POST /api/affiliate/admin/affiliates/{id}/suspend | AdminAffiliateController | SecurityConfig:44 | 401 | 403 | 2xx |
| affiliate-service | GET /api/affiliate/admin/loyalty | LoyaltyMeAdminController | @PreAuthorize:60 | 401 | 403 | 2xx |
| affiliate-service | POST /api/affiliate/admin/loyalty/adjust | LoyaltyMeAdminController | @PreAuthorize:73 | 401 | 403 | 2xx |
| affiliate-service | GET /api/affiliate/admin/stats | AdminAffiliateController | SecurityConfig:44 | 401 | 403 | 2xx |
| catalog-service | GET /api/catalog/admin/categories | AdminCategoryController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | POST /api/catalog/admin/categories | AdminCategoryController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | DELETE /api/catalog/admin/categories/{id} | AdminCategoryController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | GET /api/catalog/admin/categories/{id} | AdminCategoryController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | PUT /api/catalog/admin/categories/{id} | AdminCategoryController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | GET /api/catalog/admin/products | AdminProductController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | POST /api/catalog/admin/products | AdminProductController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | DELETE /api/catalog/admin/products/{id} | AdminProductController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | GET /api/catalog/admin/products/{id} | AdminProductController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | PUT /api/catalog/admin/products/{id} | AdminProductController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | GET /api/catalog/admin/products/export.csv | AdminProductController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | GET /api/catalog/admin/reviews | AdminReviewController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | POST /api/catalog/admin/reviews/{id}/approve | AdminReviewController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | POST /api/catalog/admin/reviews/{id}/reject | AdminReviewController | SecurityConfig:57 | 401 | 403 | 2xx |
| catalog-service | POST /api/catalog/admin/uploads | AdminProductController | SecurityConfig:57 | 401 | 403 | 2xx |
| identity-service | GET /admin/newsletter | AdminNewsletterController | SecurityConfig:60 | 401 | 403 | 2xx |
| identity-service | GET /admin/users | AdminUserController | @PreAuthorize:27 | 401 | 403 | 2xx |
| inventory-service | GET /inventory/admin/low-stock | InventoryQueryController | SecurityConfig:52 | 401 | 403 | 2xx |
| inventory-service | PUT /inventory/admin/stocks | AdminStockController | SecurityConfig:52 | 401 | 403 | 2xx |
| inventory-service | GET /inventory/admin/stocks/{variantId} | AdminStockController | SecurityConfig:52 | 401 | 403 | 2xx |
| log-service | GET /api/log/admin/events | AdminEventController | SecurityConfig:40 | 401 | 403 | 2xx |
| ordering-service | GET /admin/coupons | AdminCouponController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/coupons | AdminCouponController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | DELETE /admin/coupons/{code} | AdminCouponController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | PUT /admin/coupons/{code} | AdminCouponController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/coupons/{code}/toggle | AdminCouponController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/orders | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/orders/{id} | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/orders/{id}/cancel | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/orders/{id}/deliver | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/orders/{id}/invoice | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/orders/{id}/ship | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/orders/export.csv | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/rma | AdminRmaController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/rma/{id}/approve | AdminRmaController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/rma/{id}/mark-received | AdminRmaController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/rma/{id}/refund | AdminRmaController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | POST /admin/rma/{id}/reject | AdminRmaController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/stats/orders-summary | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/stats/revenue-by-day | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |
| ordering-service | GET /admin/stats/top-products | AdminOrderController | SecurityConfig:53 | 401 | 403 | 2xx |

**@PreAuthorize KHÔNG admin** (đóng list, 0 — EXPECTED: tuỳ expression, guest/user 2xx nếu permitAll/anonymous):

| service | endpoint | expression | ghi chú |
| --- | --- | --- | --- |
| — | — | — | 0 |

**Public paths điểm danh (permitAll per SecurityConfig):**

| service | permitAll patterns |
| --- | --- |
| affiliate-service | /api/affiliate/track/click · /api/affiliate/internal/** · /actuator/health/** · /actuator/info · /swagger-ui.html · /swagger-ui/** · /v3/api-docs/** |
| cart-service | /actuator/** · /v3/api-docs/** · /swagger-ui/** · /swagger-ui.html · ** |
| catalog-service | /api/catalog/products/** · /api/catalog/categories/** · /api/catalog/search/** · /api/catalog/products/** · /api/catalog/categories/** · /api/catalog… |
| identity-service | /auth/register · /auth/login · /auth/refresh · /auth/logout · /password/** · /newsletter · /.well-known/jwks.json · /oauth/** · /.well-known/oauth-pr… |
| inventory-service | /inventory/availability · /inventory/availability · /inventory/reservations/** · /actuator/** · /v3/api-docs/** · /swagger-ui/** · /swagger-ui.html |
| log-service | /actuator/** · /v3/api-docs/** · /swagger-ui/** · /swagger-ui.html |
| ordering-service | /orders/validate-coupon · /coupons/public · /shipping/methods · /actuator/health/** · /actuator/info · /swagger-ui.html · /swagger-ui/** · /v3/api-do… |
| partner-api | ** |

**Findings GAP (RBAC-xx — A11):**

| ID | kind | chi tiết | evidence |
| --- | --- | --- | --- |
| — | — | 0 GAP | — |

**Exit rbac-matrix: `0`** — legend: 0 = 0 finding CHƯA fix · 1 = ≥1 finding · 2 = script error. Static EXPECTED — live execute là harness SF-2 + triage SF-4.
<!-- /sf1:rbac -->

<!-- sf1:contracts -->
### Contracts freshness — openapi ↔ controllers (A12)

Run 2026-09-10 06:57:24 UTC — 10 yaml ↔ 9 module backend. So khớp **(method, path)** sau chuẩn hóa: strip gateway-prefix theo gateway-routes.yml (identity/ordering StripPrefix=2 · inventory/payment StripPrefix=1 · còn lại 0) · `{param}` → `{*}` (Spring match theo vị trí segment, không tên biến) · ignore-list non-API áp 2 phía: actuator, swagger, swagger-ui, swagger-ui.html, v3, error, internal, generate.

**Findings: 0** (STALE-SPEC=0 — spec-op không có controller · STALE-CTRL=0 — controller route không có spec-op) → exit **0**. FINDING-ONLY — không tự sửa contracts/ hay controller (fix = SF-4).

**Chi tiết finding (CT-xx — A11 deterministic, service-scoped):**

| ID | chiều | module | route (service-side) | ghi chú | evidence |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | 0 finding | — |

**Coverage per yaml:**

| yaml | module | path khai báo | ops so khớp | ignored spec | ignored ctrl | stale-spec | stale-ctrl* |
| --- | --- | --- | --- | --- | --- | --- | --- |
| affiliate.yaml | affiliate-service | 16 | 15 | 1 | 1 | 0 | 0 |
| cart.yaml | cart-service | 4 | 6 | 0 | 0 | 0 | 0 |
| catalog.yaml | catalog-service | 23 | 32 | 0 | 2 | 0 | 0 |
| identity.yaml | identity-service | 19 | 20 | 0 | 0 | 0 | 0 |
| inventory.yaml | inventory-service | 5 | 5 | 0 | 0 | 0 | 0 |
| invoice.yaml | ordering-service | 1 | 0 | 1 | 0 | 0 | 0 |
| notification.yaml | notification-service | 2 | 0 | 0 | 0 | 0 | 0 |
| ordering.yaml | ordering-service | 28 | 31 | 0 | 0 | 0 | 0 |
| partner-api.yaml | partner-api | 6 | 6 | 0 | 0 | 0 | 0 |
| payment.yaml | payment-service | 5 | 5 | 0 | 0 | 0 | 0 |

> *stale-ctrl gộp theo MODULE (module nhận union các yaml map vào nó — vd ordering-service: ordering.yaml + invoice.yaml). Map CONSTANT A12: `invoice.yaml → ordering-service` (không có module invoice-service trong backend/ — renderer Python :8090 ngoài backend/, probe chỉ scan Java @*Mapping nên op POST /api/invoice/generate được bỏ qua qua IGNORE_SEGMENTS segment 'generate' — CT-23 SF-4/FI-408; runtime cover bởi s2s matrix row HttpInvoiceProvider). Scope: log-service/template-service/gateway không có yaml → ngoài probe. Phương pháp: parse line-level (A9, fail-loud exit 2) — spec: `paths:` indent 0, path key indent 2, verb key indent 4; controller: class-level `@RequestMapping` + method-level `@*Mapping` (chỉ file *Controller.java src/main). Không đọc .env; không emit giá trị env (chuỗi khớp secret-pattern → «masked»).
<!-- /sf1:contracts -->
