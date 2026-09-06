# Ecommerce platform — dev workflow
# Dev mode: compose = infra only; backend services chạy host JVM (`make dev`),
# frontend chạy vite (`make dev-fe`). Containerize toàn bộ = profile `full` (SF-10).

COMPOSE ?= docker compose

.PHONY: help infra down keys full dev dev-fe

help: ## Liệt kê targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

infra: ## Bật infra stack (postgres 5 DB / redis / rabbitmq / mailpit)
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

full: ## (stub — SF-10 lấp: compose profile full, toàn bộ containerized)
	@echo "make full: STUB — profile 'full' được SF-10 (FI-320) wire"; exit 1

# ── Backend service name → maven module (append service mới ở case dưới) ──
# dev svc=<tên-ngắn>: template-service gateway identity catalog cart inventory
#                     ordering payment notification

dev: ## Chạy 1 backend service dev mode — vd: make dev svc=template-service
ifeq ($(svc),)
	$(error svc=? — template-service | gateway | identity | catalog | cart | inventory | ordering | payment | affiliate | partner-api | notification)
endif
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
	  invoice-service) \
	    cd services/invoice-service && \
	    test -x .venv/bin/uvicorn || { python3 -m venv .venv && .venv/bin/pip install --quiet "fastapi>=0.115" "uvicorn>=0.30" "reportlab>=4.2" "pydantic>=2.8"; }; \
	    exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8090 ;; \
	  partner-api)      MOD=services/partner-api ;; \
	  *) echo "✗ svc '$(svc)' chưa có — xem bảng port trong README"; exit 1 ;; \
	esac ; \
	cd backend && mvn -pl $$MOD spring-boot:run

dev-fe: ## Chạy 1 vite app dev mode — vd: make dev-fe app=shell
ifeq ($(app),)
	$(error app=? — shell | mfe-storefront | mfe-checkout | mfe-account | mfe-admin)
endif
	@pnpm -C frontend --filter $(app) dev
