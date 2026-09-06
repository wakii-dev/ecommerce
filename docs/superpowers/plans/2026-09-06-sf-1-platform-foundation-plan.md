# Plan — SF-1 platform-foundation (FI-311)

> Story FI-310 · Spec: docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md · Context pack: docs/superpowers/contexts/sf-1.md
> Tier: Full · Merge target: story/fi310-ecommerce-platform · Mỗi task = 1 atomic commit

## Tasks (thứ tự theo dependency — không theo thứ tự bracket)

- [x] 1. monorepo-scaffold-makefile-readme-env — root scaffold: `.gitignore`, `.editorconfig`, `.env.example`, `README.md` (quickstart), `Makefile` base targets (`infra`, `full` stub, `keys`, `down`, `help`)
- [x] 2. maven-multimodule-parent-springboot3-java21 — `backend/pom.xml` parent: Java 21, Boot 3.3.x, modules (gateway, services/template-service, shared/common-lib), dependencyManagement pre-pin (spring-cloud BOM, starters, springdoc, flyway+pg, testcontainers BOM, stripe-java, jackson)
- [x] 3. common-lib-event-envelope-outbox-base-error-model — `backend/shared/common-lib/`: `EventEnvelope`, `OutboxWriter` + `OutboxRelay` (@Scheduled poll → topic exchange → mark sent, retry + FAILED cap), idempotent `processed_messages`, `ApiError` + `GlobalExceptionHandler` (RFC 7807 problem+json), shared migration snippet `sql/outbox-schema.sql` + unit tests
- [x] 4. compose-infra-stack-5db-redis-rabbitmq-mailpit-stripecli — `docker-compose.yml` (postgres:16, redis:7, rabbitmq:3-management, mailpit, stripe-cli profile `stripe`), `infra/db/init/01-create-dbs.sh` (5 service DBs + db_template sandbox), named volumes + network
- [x] 5. compose-healthchecks-wiring — healthcheck TẤT CẢ services + `depends_on: condition: service_healthy` wiring
- [x] 6. service-template-module-health-actuator-dockerfile — `backend/services/template-service/`: app skeleton :8099, actuator `{health,ready}`, Dockerfile multi-stage
- [x] 7. template-springdoc-flyway-conventions — springdoc UI, Flyway `V1__init.sql` (placeholder + outbox schema), `application.yml` conventions (port-table comment, profile `dev` đọc env compose)
- [x] 8. template-testcontainers-it-harness — `@Testcontainers` base + postgres container + 1 smoke IT (context + flyway applied + health UP), chạy được `mvn -pl services/template-service test`
- [x] 9. gateway-skeleton-route-table-cors — `backend/gateway/`: SCG WebFlux :8080, route table file riêng (7 block placeholder + smoke), global CORS dev `localhost:5173-5179`
- [x] 10. gateway-requestid-filter — global filter gen/propagate `X-Request-Id` (request + response + MDC log), gateway smoke test (WebTestClient)
- [x] 11. contracts-dir-skeleton-openapi-lint — `contracts/openapi/`, `contracts/events/` (gitkeep), `.spectral.yaml`, `contracts/README.md` (quy tắc freeze + additive-only events)
- [x] 12. pnpm-turbo-frontend-workspace — `frontend/`: `pnpm-workspace.yaml` (workspace + catalog pre-pin R3), `turbo.json` (dev/build/test/lint/gen), root `package.json`, `packages/config/` (tsconfig.base + eslint preset + vite preset MF import), `.npmrc`, apps/ + packages/{contracts,auth,ui-kit,i18n} gitkeep → `pnpm install && pnpm build` xanh
- [x] 13. makefile-dev-targets-per-service — Makefile `dev svc=<name>` + `dev-fe app=<name>`, e2e: `make dev svc=template-service` boot :8099 health UP + `make dev svc=gateway` smoke 200 X-Request-Id
- [x] 14. (scope-addendum D14+D15, 2026-09-06 sau khi fork) — compose thêm mongo:7 + mongo-express :8089 + elasticsearch:8.17.4 :9200 (single-node, heap 512m, không kibana); `.env.example` thêm MONGO_URI + ELASTICSEARCH_URI; acceptance mở rộng: mongo-express + ES cluster info healthy
- [x] 15. (review round-2 fixes) — P1-1/2 idempotent native insert-ignore cùng tx + regression IT · P1-3 CORS 7 origin tường minh + preflight tests · P1-4 MF package `@module-federation/vite` (spec gap đã report FI-310) · P1-5 relay phân biệt lỗi hạ tầng · P1-6 outbox write→jsonb→relay IT · P2: Dockerfile WORKDIR, spectral 1 dòng, db_notification, NotFound leak, pnpm 10

## ACCEPTANCE (Phase 5 — kiểm từng dòng)

1. `docker compose up -d` → postgres (5 DB), redis, rabbitmq (UI :15672), mailpit (UI :8025) healthy
2. `make dev svc=template-service` → boot, `GET :8099/actuator/health` UP, springdoc UI mở được
3. `make dev svc=gateway` → smoke route 200 + `X-Request-Id` trong response
4. `pnpm -C frontend install && pnpm -C frontend build` → turbo build xanh
5. `mvn -pl services/template-service test` → Testcontainers IT xanh
