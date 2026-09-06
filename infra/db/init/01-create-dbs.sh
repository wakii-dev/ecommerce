#!/bin/bash
# Tạo DB-per-service trên MỘT container Postgres (spec D8).
# Chạy 1 lần khi volume pgdata trống (docker-entrypoint-initdb.d).
set -euo pipefail

for db in db_identity db_catalog db_ordering db_payment db_inventory db_template; do
  if ! psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
    psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $db"
    echo "[init] created $db"
  else
    echo "[init] exists  $db"
  fi
done

# db_template = sandbox của template-service (SF-1 scaffold) — service thật KHÔNG dùng.
