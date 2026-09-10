# Ecommerce platform — dev workflow
# Dev mode: compose = infra only; backend services chạy host JVM (`make dev`),
# frontend chạy vite (`make dev-fe`).
# SF-10: `make dev` KHÔNG tham số = FULL STACK (infra + 10 JVM + invoice +
# 5 FE app); `make full` = 100% containerized (compose profile full).

COMPOSE ?= docker compose

.PHONY: help infra down keys stripe-listen full full-stop dev dev-stop dev-fe seed qa-fresh-boot e2e

help: ## Liệt kê targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

infra: ## Bật infra stack (postgres 9 DB / redis / rabbitmq / mailpit / mongo / es)
	$(COMPOSE) up -d
	@echo "→ Trạng thái: docker compose ps"

down: ## Stop infra stack
	$(COMPOSE) down

keys: ## Sinh RSA keypair JWT → infra/keys/ (gitignored, SF-3 identity dùng)
	@mkdir -p infra/keys
	@if [ -f infra/keys/jwt-private.pem ]; then \
		echo "infra/keys/jwt-private.pem đã tồn tại — bỏ qua (xóa để regenerate)"; exit 0; fi
	openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out infra/keys/jwt-private.pem
	openssl rsa -in infra/keys/jwt-private.pem -pubout -out infra/keys/jwt-public.pem 2>/dev/null
	@echo "→ Đã sinh infra/keys/jwt-{private,public}.pem"

stripe-listen: ## (SF-1) `stripe listen` (compose stripe-cli) forward webhook → payment :8086 — in whsec để điền .env
	@test -f .env || { echo "✗ thiếu .env — cần STRIPE_SECRET_KEY (sk_test_*)"; exit 1; }
	@bash -c '\
		SK=$$(grep -E "^STRIPE_SECRET_KEY=sk_test_" .env | head -1 | cut -d= -f2-); \
		test -n "$$SK" || { echo "✗ .env thiếu STRIPE_SECRET_KEY (sk_test_*)"; exit 1; }; \
		mkdir -p .run; \
		docker rm -f ecommerce-stripe-cli-listen >/dev/null 2>&1 || true; \
		docker compose --profile stripe run --rm -d --name ecommerce-stripe-cli-listen stripe-cli \
		  listen --api-key "$$SK" \
		  --forward-to host.docker.internal:8086/payment/webhook >/dev/null 2>&1; \
		echo "→ forwarding → http://host.docker.internal:8086/payment/webhook (log: docker logs ecommerce-stripe-cli-listen)"; \
		W=""; \
		for i in $$(seq 1 30); do \
		  W=$$(docker logs ecommerce-stripe-cli-listen 2>&1 | grep -o "whsec_[A-Za-z0-9]*" | head -1); \
		  [ -n "$$W" ] && break; \
		  sleep 1; \
		done; \
		if [ -n "$$W" ]; then \
		  echo "→ STRIPE_WEBHOOK_SECRET=$$W"; \
		  echo "  (điền vào .env rồi restart payment: make dev svc=payment)"; \
		else \
		  echo "✗ chưa thấy whsec sau 30s:"; tail -5 .run/stripe-listen.log; exit 1; \
		fi'

db-ensure: ## (SF-10) Tạo DB thiếu trên volume cũ (init script chỉ chạy volume rỗng)
	@for db in db_identity db_catalog db_ordering db_payment db_inventory db_template db_notification db_partner db_affiliate; do \
		if ! $(COMPOSE) exec -T postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$$db'" | grep -q 1; then \
			$(COMPOSE) exec -T postgres psql -U postgres -d postgres -c "CREATE DATABASE $$db" >/dev/null && echo "[db-ensure] created $$db"; \
		fi; \
	done

full: ## (SF-10) Stack 100% containerized — compose profile full (build mọi image)
	@test -f .env || { echo "✗ thiếu .env (cp .env.example .env) — Stripe key rỗng → payment degraded"; }
	$(MAKE) -s keys
	$(COMPOSE) --profile full up -d --build
	@echo "→ Gateway :8080 · Mailpit :8025 · mongo-express :8089 · RabbitMQ :15672"
	@echo "→ Dừng: make full-stop"

full-stop: ## Stop stack full
	$(COMPOSE) --profile full down

dev: ## Không tham số = FULL STACK dev · hoặc 1 service: make dev svc=identity
ifeq ($(svc),)
	@bash scripts/dev-stack.sh
else
	@case "$(svc)" in \
	  template-service) MOD=services/template-service ;; \
	  gateway)          MOD=gateway ;; \
	  identity)         MOD=services/identity-service ;; \
	  catalog)          MOD=services/catalog-service ;; \
	  cart)             MOD=services/cart-service ;; \
	  inventory)        MOD=services/inventory-service ;; \
	  ordering)         MOD=services/ordering-service ;; \
	  payment)          MOD=services/payment-service ;; \
	  affiliate)        MOD=services/affiliate-service ;; \
	  notification)     MOD=services/notification-service ;; \
	  log)              MOD=services/log-service ;; \
	  invoice-service) \
	    cd services/invoice-service && \
	    test -x .venv/bin/uvicorn || { python3 -m venv .venv && .venv/bin/pip install --quiet "fastapi>=0.115" "uvicorn>=0.30" "reportlab>=4.2" "pydantic>=2.8"; }; \
	    exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8090 ;; \
	  partner-api)      MOD=services/partner-api ;; \
	  *) echo "✗ svc '$(svc)' chưa có — xem bảng port trong README"; exit 1 ;; \
	esac ; \
	cd backend && mvn -pl $$MOD spring-boot:run
endif

dev-stop: ## Dừng full stack dev (kill theo PID — infra vẫn chạy)
	@bash scripts/dev-stop.sh

dev-fe: ## Chạy 1 vite app dev mode — vd: make dev-fe app=shell
ifeq ($(app),)
	$(error app=? — shell | mfe-checkout | mfe-account | mfe-admin)
endif
	@pnpm -C frontend --filter $(app) dev

seed: ## (SF-10) Deterministic seed — admin/user demo, WELCOME10/GIAM50K, orders CONFIRMED
	@bash scripts/seed/seed.sh

qa-fresh-boot: ## (FI-406 SF-2) DESTRUCTIVE fresh-boot harness — backup → wipe → build → up → seed → probes (cần QA_FRESH_BOOT_CONFIRM=1)
	@test -f scripts/qa/fresh-boot-harness.sh || { echo "✗ thiếu scripts/qa/fresh-boot-harness.sh"; exit 1; }
	@bash scripts/qa/fresh-boot-harness.sh

e2e: ## (SF-10) Playwright E2E — CẦN dev stack đang chạy (make dev) + .env
	cd frontend && pnpm --filter @ecommerce/e2e exec playwright test
