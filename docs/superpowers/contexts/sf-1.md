# SF-1 Context Pack — platform-foundation

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)

1. **Root scaffold**: `Makefile` — targets: `infra` (compose up -d infra), `dev svc=<name>` (chạy 1 service dev mode), `dev-fe app=<name>` (chạy 1 vite app), `full` (compose profile full — chỉ tạo target stub, SF-10 lấp), `keys` (generate RSA keypair JWT cho SF-3); `README.md` (quickstart: yêu cầu JDK 21, pnpm, docker, `make infra && make dev`); `.env.example` (`SPRING_DATASOURCE_URL` per db, RABBITMQ/REDIS hosts, `MONGO_URI`, `ELASTICSEARCH_URI=http://localhost:9200`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `REMOTE_*_URL` placeholders); `.gitignore`, `.editorconfig`.
2. **Backend Maven multi-module** `backend/`: parent pom — Java 21, Spring Boot 3.3.x; modules: `gateway`, `services/*`, `shared/common-lib`; dependencyManagement pre-pin: spring-cloud gateway BOM, spring-boot-starter-{web,security,oauth2-resource-server,data-jpa,data-redis,amqp,mail,actuator,validation}, springdoc-openapi, flyway, postgres driver, testcontainers (pg, rabbitmq, junit-jupiter), `stripe-java`, jackson. Mục tiêu pre-pin: SF sau ít đụng pom chung (R3).
3. **Service template** `backend/services/template-service` (source of truth copy-scaffold): Spring Boot app tối giản + actuator `{health,ready}` + springdoc UI + Flyway placeholder `V1__init.sql` + `application.yml` conventions (port table ghi comment: gateway 8080, identity 8081, catalog 8082, cart 8083, inventory 8084, ordering 8085, payment 8086, notification 8087; profile `dev` đọc env compose infra) + Dockerfile multi-stage + IT harness base (`@Testcontainers` + postgres container, 1 smoke test).
4. **Compose infra** `docker-compose.yml`: postgres:16 (1 container; `infra/db/init/01-create-dbs.sh` tạo `db_identity`, `db_catalog`, `db_ordering`, `db_payment`, `db_inventory`), redis:7, rabbitmq:3-management (5672/15672), mailpit (SMTP 1025, UI 8025), **mongo:7 (cho log-service SF-10 — D14) + mongo-express (UI :8089)**, **elasticsearch:8-single-node (cho search SF-4 — D15: `xpack.security.enabled=false`, `ES_JAVA_OPTS=-Xms512m -Xmx512m`, ports 9200; KHÔNG kibana)**, stripe-cli (profile `stripe`, listen → forward `/api/payment/webhook`, đọc `STRIPE_WEBHOOK_SECRET`); healthcheck TẤT CẢ; volumes + network tên. Backend services KHÔNG containerize ở dev (chạy host) — containerize là profile `full` (SF-10).
5. **Gateway** `backend/gateway/`: Spring Cloud Gateway (WebFlux) — route table file riêng (mỗi service 1 block placeholder comment, SF sau append), global CORS dev (`localhost:5173-5179`), request-id filter (gen/propagate `X-Request-Id`, log MDC), health route.
6. **common-lib** `backend/shared/common-lib/`: `EventEnvelope` (eventId, eventType, occurredAt, correlationId, payload JsonNode); `OutboxWriter` + `OutboxRelay` base (`@Scheduled` poll → publish RabbitMQ topic exchange → mark sent; retry + dead-letter conventions; bảng `outbox` + `processed_messages` migration snippet dùng chung); `ApiError` + `GlobalExceptionHandler` (RFC 7807 problem+json).
7. **contracts/ skeleton**: `contracts/openapi/`, `contracts/events/` (gitkeep), lint config (spectral hoặc .redocly.yaml), `contracts/README.md` ghi quy tắc freeze + additive-only events.
8. **Frontend workspace** `frontend/`: `pnpm-workspace.yaml` (apps/*, packages/*), `turbo.json` (pipeline dev/build/test/lint/gen), root package.json, `packages/config/` (tsconfig.base.json, eslint preset, vite preset có `@module-federation/enhanced` import sẵn), `.npmrc`.
9. **Pre-pin FE deps** (root/workspace, R3): react 18, react-dom, react-router-dom, @tanstack/react-query, @module-federation/enhanced, tailwindcss, i18next + react-i18next, vitest, playwright (root devDep). SF sau ưu tiên deps đã pin.
10. `make dev svc=template-service` chạy được end-to-end.

## Touch map (files SF-1 tạo/sở hữu)

```
Makefile · README.md · .env.example · .gitignore · .editorconfig
docker-compose.yml · infra/db/init/
backend/pom.xml · backend/gateway/** · backend/shared/common-lib/** · backend/services/template-service/**
contracts/spectral.yaml|redocly.yaml · contracts/README.md · contracts/openapi/ · contracts/events/
frontend/pnpm-workspace.yaml · frontend/package.json · frontend/turbo.json · frontend/.npmrc · frontend/packages/config/**
frontend/apps/ (trống) · frontend/packages/{contracts,auth,ui-kit,i18n}/ (gitkeep)
```
READ-ONLY: `docs/superpowers/**` (coordinator).

## ACCEPTANCE (user-visible)

- `docker compose up -d` → postgres (5 DB tồn tại), redis, rabbitmq (UI :15672), mailpit (UI :8025), mongo (mongo-express UI :8089), elasticsearch (`curl :9200` trả cluster info) healthcheck XANH.
- `make dev svc=template-service` → service boot, `GET :8099/actuator/health` → UP, springdoc UI mở được.
- `make dev svc=gateway` → smoke route 200, response có `X-Request-Id`.
- `pnpm -C frontend install && pnpm -C frontend build` → turbo build XANH.
- `mvn -pl services/template-service test` → IT smoke (Testcontainers) XANH.

## Boundary (KHÔNG làm)

- KHÔNG viết business logic/API của 7 service thật (chỉ template).
- KHÔNG viết nội dung OpenAPI specs / event schemas (SF-2).
- **SCOPE-ADDENDUM D14 (2026-09-06)**: Mongo + mongo-express nằm trong compose của SF-1 (container only); `log-service` KHÔNG thuộc SF-1 — SF-10 build.
- **SCOPE-ADDENDUM D15 (2026-09-06)**: Elasticsearch container nằm trong compose của SF-1 (container only, heap 512m, không kibana); SearchEngine/indexer KHÔNG thuộc SF-1 — SF-4 build.
- KHÔNG tạo shell/mfe apps (SF-2 federation harness).
- KHÔNG cấu hình JWT/auth chi tiết (SF-3).
- Sửa `docker-compose.yml` sau này = append-only block; nếu phát hiện bug nền giữa chừng → phối hợp coordinator, không sửa chung khi SF khác đang chạy.
