# storefront-web (SF-10, profile full) — Next standalone container riêng
# (pack item 3). Build context = REPO ROOT (workspace packages @ecommerce/*
# cần transpilePackages) — compose: context: ., dockerfile: frontend/apps/
# storefront-web/Dockerfile.
#
#   docker build -f frontend/apps/storefront-web/Dockerfile .

FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY frontend/pnpm-workspace.yaml frontend/pnpm-lock.yaml frontend/package.json frontend/turbo.json ./
COPY frontend/packages ./packages
COPY frontend/apps ./apps
RUN pnpm install --frozen-lockfile=false --prefer-offline
RUN pnpm --filter storefront-web exec next build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Standalone output trong monorepo → server.js nằm tại apps/storefront-web/
COPY --from=build /workspace/apps/storefront-web/.next/standalone ./
COPY --from=build /workspace/apps/storefront-web/.next/static ./apps/storefront-web/.next/static
COPY --from=build /workspace/apps/storefront-web/public ./apps/storefront-web/public
EXPOSE 3000
CMD ["node", "apps/storefront-web/server.js"]
