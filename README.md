# Ecommerce Platform

Microservices (Spring Boot 3 / Java 21) + micro frontends (Vite / React 18 / Module Federation).
Story: FI-310 · Spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md`.

## Yêu cầu

| Tool | Version |
|---|---|
| JDK | 21+ (`java -version`) |
| Maven | 3.9+ |
| Docker + Compose | daemon đang chạy |
| Node | 20+ |
| pnpm | 9+ (`corepack enable`) |

## Quickstart

```bash
# 1. Copy env (Stripe keys test lấy từ dashboard Stripe)
cp .env.example .env

# 2. Bật infra: postgres (5 DB), redis, rabbitmq, mailpit
make infra

# 3. Build backend lần đầu (đẩy common-lib + parent vào ~/.m2)
cd backend && mvn install -DskipTests && cd ..

# 4. Chạy 1 service dev mode (host JVM, không containerize)
make dev svc=template-service     # :8099 — http://localhost:8099/actuator/health
make dev svc=gateway              # :8080 — http://localhost:8080/api/smoke

# 5. Frontend workspace
pnpm -C frontend install
pnpm -C frontend build
```

## Port table

| Service | Port | Ghi chú |
|---|---|---|
| gateway | 8080 | Spring Cloud Gateway — smoke: `/api/smoke` |
| identity | 8081 | SF-3 |
| catalog | 8082 | SF-4 |
| cart | 8083 | SF-6 |
| inventory | 8084 | SF-5 |
| ordering | 8085 | SF-9 |
| payment | 8086 | SF-5 |
| notification | 8087 | SF-10 |
| template | 8099 | Service template (scaffold nguồn) |

| Infra | Port | Ghi chú |
|---|---|---|
| postgres | 5432 | 1 container — DB-per-service (`db_identity`, `db_catalog`, `db_ordering`, `db_payment`, `db_inventory` + `db_template` sandbox) |
| redis | 6379 | cart + cache |
| rabbitmq | 5672 / 15672 | AMQP / Management UI (guest/guest) |
| mailpit | 1025 / 8025 | SMTP sink / UI xem email |

## Make targets

| Target | Ý nghĩa |
|---|---|
| `make infra` | `docker compose up -d` (infra only — services JVM chạy host) |
| `make infra profile=stripe` | + stripe-cli forward webhook `/api/payment/webhook` |
| `make dev svc=<name>` | chạy 1 backend service dev mode |
| `make dev-fe app=<name>` | chạy 1 vite app |
| `make keys` | sinh RSA keypair JWT vào `infra/keys/` (SF-3) |
| `make down` | stop infra |
| `make full` | (stub) compose profile `full` — SF-10 lấp |

## Repo layout

```
backend/       Maven multi-module — gateway, services/*, shared/common-lib
frontend/      pnpm workspace + Turborepo — apps/*, packages/*
contracts/     OpenAPI + event schemas (SOURCE OF TRUTH, freeze tại SF-2)
infra/         db init scripts, keys (gitignored)
docs/          specs, brackets, context packs, plans, ADR
```
