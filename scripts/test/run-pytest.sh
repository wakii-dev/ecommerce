#!/usr/bin/env bash
# run-pytest.sh (FI-366 SF-1 T1) — invoice-service pytest qua .venv riêng.
# Venv tự tạo nếu thiếu (khớp Makefile dev target: fastapi/uvicorn/reportlab/pydantic).
set -euo pipefail
cd "$(dirname "$0")/../.."

SVC=services/invoice-service
LOG_DIR=".run/test-logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/pytest-$(date +%Y%m%d-%H%M%S).log"

if [ ! -x "$SVC/.venv/bin/pytest" ]; then
  echo "[run-pytest] .venv thiếu pytest — cài deps + test deps…"
  test -x "$SVC/.venv/bin/python" || python3 -m venv "$SVC/.venv"
  # KHÔNG `pip install .` — flat-layout (app+assets) vỡ setuptools discovery;
  # pyproject ghi "không cần pip install" (import qua pythonpath).
  # List khớp pyproject [project.dependencies] + [dev] — giữ 2 bên đồng bộ.
  "$SVC/.venv/bin/pip" install --quiet \
    "fastapi>=0.115" "uvicorn>=0.30" "reportlab>=4.2" "pydantic>=2.8" \
    "pytest>=8.3" "httpx>=0.27" "pypdf>=4.3"
fi

echo "[run-pytest] pytest $SVC/tests — log: $LOG"
set +e
( cd "$SVC" && .venv/bin/pytest tests -q 2>&1 ) | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e
echo "[run-pytest] exit=$RC · log: $LOG"
exit "$RC"
