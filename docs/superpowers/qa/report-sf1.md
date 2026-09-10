# QA Static Audit — SF-1 (FI-405)

> Report marker-based: MỖI script regen block `<!-- sf1:<section> -->` của mình
> (read → replace → write, idempotent re-run). Block do script sinh — KHÔNG sửa tay.
> config-audit.mjs: summary + axis-a/b/c · s2s-auth-matrix.mjs: s2s ·
> rbac-matrix.mjs: rbac · contracts-freshness.mjs: contracts.
> Exit semantics chung 4 script: 0 = 0 finding CHƯA fix · 1 = ≥1 finding CHƯA fix · 2 = script error.

<!-- sf1:summary -->
**config-audit** run 2026-09-10 00:45:57 UTC — compose `docker-compose.yml` · backend `backend`

| Trục | Kiểm | DANGEROUS | UNFIXED | FIXED (registry) | WARN (non-finding) |
| --- | --- | --- | --- | --- | --- |
| (a) env var | 221 | 6 | 6 | 0 | 13 |
| (b) volume mount | 8 | 2 | 2 | 0 | — |
| (c) compose checklist | 14 | 11 | 11 | 0 | 2 |

**Exit config-audit: `1`** — legend: `0` = 0 finding CHƯA fix · `1` = ≥1 finding CHƯA fix · `2` = script error. Tổng unfixed: **19** (finding ID `CFG-xx`; FIXED registry `scripts/qa/config-audit-fixed.json`).

> Bảng exit ĐỦ 4 script (config-audit · s2s · rbac · contracts) do recipe `make qa-audit` ghi
> vào block này SAU KHI đủ 4 exit — script standalone KHÔNG biết exit của script khác.
<!-- /sf1:summary -->

<!-- sf1:axis-a -->
### Trục (a) — env var code ↔ compose (A1)

Đối chiếu 221 env-var. Trạng thái: UNSET=136 · OK=41 · SEE-AXIS-B=7 · WARN=13 · DANGEROUS=6 · SKIP-FE=8 · SET-EMPTY=2 · SKIP-NOENTRY=8. WARN/UNSET/SKIP **không phải finding**.

**Findings DANGEROUS:**

| ID | service | var | ghi chú | evidence |
| --- | --- | --- | --- | --- |
| CFG-A-01 | cart-service | RABBITMQ_HOST | default localhost trỏ localhost — container không tới được (pattern LOG_URI 9/9) | backend/services/cart-service/src/main/resources/application.yml:22 · compose không set RABBITMQ_HOST |
| CFG-A-02 | catalog-service | INVENTORY_BASE_URL | default http://localhost:8084 trỏ localhost — container không tới được (pattern LOG_URI 9/9) | backend/services/catalog-service/src/main/resources/application.yml:95 · compose không set INVENTORY_BASE_URL |
| CFG-A-03 | identity-service | IDENTITY_OAUTH_PUBLIC_BASE_URL | default http://localhost:8080 trỏ localhost — container không tới được (pattern LOG_URI 9/9) | backend/services/identity-service/src/main/resources/application.yml:50 · compose không set IDENTITY_OAUTH_PUBLIC_BASE_… |
| CFG-A-04 | identity-service | RABBITMQ_HOST | default localhost trỏ localhost — container không tới được (pattern LOG_URI 9/9) | backend/services/identity-service/src/main/resources/application.yml:28 · compose không set RABBITMQ_HOST |
| CFG-A-05 | notification-service | NOTIFY_STOCK_ALERT_CATALOG_BASE_URL | default http://localhost:8082 trỏ localhost — container không tới được (pattern LOG_URI 9/9) | backend/services/notification-service/src/main/resources/application.yml:72 · compose không set NOTIFY_STOCK_ALERT_CATA… |
| CFG-A-06 | ordering-service | AFFILIATE_BASE_URL | default http://localhost:8092 trỏ localhost — container không tới được (pattern LOG_URI 9/9) | backend/services/ordering-service/src/main/resources/application.yml:71 · compose không set AFFILIATE_BASE_URL |

**WARN (non-finding, không ảnh hưởng exit):**

| service | var | compose | ghi chú |
| --- | --- | --- | --- |
| affiliate-service | SECURITY_JWKS_URI | http://identity-service:8081/.well-know… | set http://identity-service:8081/.well-known/jwks.json — host là compose service nhưng lệch port (— → 8081) —… |
| affiliate-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_affi… | set jdbc:postgresql://postgres:5432/db_affiliate — host là compose service nhưng lệch port (5433 → 5432) — WA… |
| catalog-service | CATALOG_MINIO_ENABLED | true | set true — host 'true' không phải compose service name, lệch default — WARN non-finding |
| catalog-service | SPRING_DATASOURCE_URL | jdbc:postgresql://postgres:5432/db_cata… | set jdbc:postgresql://postgres:5432/db_catalog — host là compose service nhưng lệch port (5433 → 5432) — WARN… |
| gateway | IDENTITY_JWKS_URI | http://identity-service:8081/.well-know… | set http://identity-service:8081/.well-known/jwks.json — host là compose service nhưng lệch port (8080 → 8081… |
| gateway | SPRING_PROFILES_ACTIVE | full | set full — host 'full' không phải compose service name, lệch default — WARN non-finding |
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
| affiliate-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | (không default) |
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
| cart-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | (không default) |
| cart-service | RABBITMQ_HOST | DANGEROUS | localhost | (không default) |
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
| catalog-service | INVENTORY_BASE_URL | DANGEROUS | http://localhost:8084 | (không default) |
| catalog-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | (không default) |
| catalog-service | MINIO_ROOT_PASSWORD | UNSET | «masked» | (không default) |
| catalog-service | MINIO_ROOT_USER | UNSET | minioadmin | (không default) |
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
| gateway | SHELL_WEB_ORIGIN | SKIP-FE | http://localhost:5173 | (không default) |
| gateway | SPRING_PROFILES_ACTIVE | WARN | dev | full |
| gateway | STOREFRONT_WEB_URI | SKIP-FE | http://localhost:3000 | (không default) |
| identity-service | ADMIN_EMAIL | UNSET | (rỗng) | (không default) |
| identity-service | ADMIN_PASSWORD | UNSET | (rỗng) | (không default) |
| identity-service | IDENTITY_2FA_KEY | UNSET | (rỗng) | (không default) |
| identity-service | IDENTITY_COOKIE_PATH | UNSET | /api/identity | (không default) |
| identity-service | IDENTITY_OAUTH_FE_REDIRECT_BASE | SKIP-FE | http://localhost:5173 | (không default) |
| identity-service | IDENTITY_OAUTH_PUBLIC_BASE_URL | DANGEROUS | http://localhost:8080 | (không default) |
| identity-service | IDENTITY_REFRESH_TTL_DAYS | UNSET | 30 | (không default) |
| identity-service | JWT_ACCESS_TTL_SECONDS | UNSET | 900 | (không default) |
| identity-service | JWT_KID | UNSET | identity-1 | (không default) |
| identity-service | JWT_PRIVATE_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-private.pem | (không default) |
| identity-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | (không default) |
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
| identity-service | RABBITMQ_HOST | DANGEROUS | localhost | (không default) |
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
| inventory-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | (không default) |
| inventory-service | RABBITMQ_HOST | OK | localhost | rabbitmq |
| inventory-service | RABBITMQ_PASSWORD | UNSET | «masked» | (không default) |
| inventory-service | RABBITMQ_PORT | UNSET | 5672 | (không default) |
| inventory-service | RABBITMQ_USER | UNSET | guest | (không default) |
| inventory-service | SECURITY_JWKS_URI | UNSET | (rỗng) | (không default) |
| inventory-service | SPRING_DATASOURCE_PASSWORD | UNSET | «masked» | (không default) |
| inventory-service | SPRING_DATASOURCE_URL | WARN | jdbc:postgresql://localhost:5433/db_inventory | jdbc:postgresql://postgres:5432/db_inventory |
| inventory-service | SPRING_DATASOURCE_USERNAME | UNSET | postgres | (không default) |
| inventory-service | SPRING_PROFILES_ACTIVE | UNSET | dev | (không default) |
| log-service | JWT_PUBLIC_KEY_PATH | SEE-AXIS-B | ../infra/keys/jwt-public.pem | (không default) |
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
| notification-service | NOTIFY_MY_ORDERS_URL | SKIP-FE | http://localhost:5173/account/orders | (không default) |
| notification-service | NOTIFY_ORDERING_TIMEOUT_MS | UNSET | 10000 | (không default) |
| notification-service | NOTIFY_RESET_PASSWORD_URL | SKIP-FE | «masked» | (không default) |
| notification-service | NOTIFY_SERVICE_ACCOUNT_EMAIL | OK | notification-svc@ecommerce.local | notification-svc@ecommerce.local |
| notification-service | NOTIFY_SERVICE_ACCOUNT_PASSWORD | OK | «masked» | «masked» |
| notification-service | NOTIFY_STOCK_ALERT_CATALOG_BASE_URL | DANGEROUS | http://localhost:8082 | (không default) |
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
| ordering-service | AFFILIATE_BASE_URL | DANGEROUS | http://localhost:8092 | (không default) |
| ordering-service | AFFILIATE_INTERNAL_TOKEN | UNSET | «masked» | (không default) |
| ordering-service | AFFILIATE_TIMEOUT_MS | UNSET | 5000 | (không default) |
| ordering-service | CATALOG_API_TOKEN | UNSET | (rỗng) | (không default) |
| ordering-service | CATALOG_BASE_URL | OK | http://localhost:8082 | http://catalog-service:8082 |
| ordering-service | CATALOG_BY_ID_PATH | UNSET | /api/catalog/admin/products/ | (không default) |
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
| partner-api | CATALOG_API_TOKEN | UNSET | (rỗng) | (không default) |
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
| CFG-B-01 | affiliate-service | JWT_PUBLIC_KEY_PATH | code cần path, compose không set env + không mount volume | backend/services/affiliate-service/src/main/java/com/ecommerce/affiliate/config/JwtDecoderConfig.java:47 · compose khôn… |
| CFG-B-02 | invoice-service | INVOICE_FONT_PATH | path /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf không thuộc volume target nào (không có) | compose env INVOICE_FONT_PATH (set) · không có volumes |

**Bảng đầy đủ:**

| service | var | path hiệu lực | volume targets | status | ghi chú |
| --- | --- | --- | --- | --- | --- |
| affiliate-service | JWT_PUBLIC_KEY_PATH | ../infra/keys/jwt-public.pem | — | DANGEROUS | code cần path, compose không set env + không mount volume |
| cart-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| catalog-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| identity-service | JWT_PRIVATE_KEY_PATH | /keys/jwt-private.pem | /keys | OK | /keys/jwt-private.pem thuộc target /keys |
| identity-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| inventory-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
| invoice-service | INVOICE_FONT_PATH | /usr/share/fonts/truetype/dejavu/DejaVuSans.t… | — | DANGEROUS | path /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf không thuộc volume target nào (không… |
| log-service | JWT_PUBLIC_KEY_PATH | /keys/jwt-public.pem | /keys | OK | /keys/jwt-public.pem thuộc target /keys |
<!-- /sf1:axis-b -->

<!-- sf1:axis-c -->
### Trục (c) — compose value drift, closed checklist (A7)

(1) postgres `max_connections` ≥ 110 · (2) healthcheck per JVM service · (3) flag ngoài bảng KNOWN_FLAGS → WARN.

**Findings DANGEROUS:**

| ID | service | check | ghi chú | evidence |
| --- | --- | --- | --- | --- |
| CFG-C-01 | affiliate-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/affiliate-service/Dockerfile |
| CFG-C-02 | cart-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/cart-service/Dockerfile |
| CFG-C-03 | catalog-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/catalog-service/Dockerfile |
| CFG-C-04 | gateway | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/gateway/Dockerfile |
| CFG-C-05 | identity-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/identity-service/Dockerfile |
| CFG-C-06 | inventory-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/inventory-service/Dockerfile |
| CFG-C-07 | log-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/log-service/Dockerfile |
| CFG-C-08 | notification-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/notification-service/Dockerfile |
| CFG-C-09 | ordering-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/ordering-service/Dockerfile |
| CFG-C-10 | partner-api | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/partner-api/Dockerfile |
| CFG-C-11 | payment-service | healthcheck | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart | build dockerfile: backend/services/payment-service/Dockerfile |

**Bảng đầy đủ:**

| service | check | status | ghi chú |
| --- | --- | --- | --- |
| affiliate-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| cart-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| catalog-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| gateway | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| identity-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| inventory-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| log-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| minio | flag:console-address | WARN | flag ngoài bảng audit (KNOWN_FLAGS) — WARN non-finding, review tay |
| notification-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| ordering-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| partner-api | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| payment-service | healthcheck | DANGEROUS | JVM service có compose entry nhưng thiếu healthcheck: — full-mode không có signal unhealthy/restart |
| postgres | max_connections | OK | 300 ≥ 110 |
| stripe-cli | flag:forward-to | WARN | flag ngoài bảng audit (KNOWN_FLAGS) — WARN non-finding, review tay |
<!-- /sf1:axis-c -->

<!-- sf1:s2s -->
(chờ s2s-auth-matrix.mjs ghi)
<!-- /sf1:s2s -->

<!-- sf1:rbac -->
(chờ rbac-matrix.mjs ghi)
<!-- /sf1:rbac -->

<!-- sf1:contracts -->
(chờ contracts-freshness.mjs ghi)
<!-- /sf1:contracts -->
