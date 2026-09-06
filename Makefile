# Ecommerce platform — dev workflow
# Dev mode: compose = infra only; backend services chạy host JVM (`make dev`),
# frontend chạy vite (`make dev-fe`). Containerize toàn bộ = profile `full` (SF-10).

COMPOSE ?= docker compose

.PHONY: help infra down keys full

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
