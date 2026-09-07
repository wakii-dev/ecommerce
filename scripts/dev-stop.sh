#!/usr/bin/env bash
# dev-stop.sh (SF-10) — dừng full stack dev: kill PID từ .run/*.pid (cả
# .port.pid = PID listener java thật) + FE. KHÔNG đụng compose infra.
set -uo pipefail
cd "$(dirname "$0")/.."

RUN_DIR=".run"

stop_pid_files() {
  for f in "$RUN_DIR"/*.pid "$RUN_DIR"/*.port.pid; do
    [ -f "$f" ] || continue
    pid=$(cat "$f" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "[dev-stop] kill $pid ($f)"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$f"
  done
}

stop_pid_files

# FE con của turbo (vite/next) — kill theo port dev (memory: kill theo PID port)
for port in 3000 5173 5174 5175 5176 5177 5178; do
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[dev-stop] kill port $port: $pids"
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
done

# JVM còn sót (java -jar target/*.jar — con mvn đã bỏ, chạy java trực tiếp)
pids=$(pgrep -f "java -jar .*/target/.*\.jar" 2>/dev/null || true)
if [ -n "$pids" ]; then
  echo "[dev-stop] kill JVM sót: $pids"
  echo "$pids" | xargs kill 2>/dev/null || true
fi

echo "[dev-stop] xong — compose infra vẫn chạy (make down để tắt)"
