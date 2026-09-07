# invoice-service (D18) — Python 3.12 slim, stateless renderer.
# Dev chạy host: make dev svc=invoice-service (uvicorn :8090).
FROM python:3.12-slim

WORKDIR /app

# Font DejaVu cho dấu tiếng Việt (renderer dùng hệ font nếu không bundle)
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn>=0.30" "reportlab>=4.2" "pydantic>=2.8"

COPY app/ app/
COPY assets/ assets/

EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
