"""FastAPI entry — POST /api/invoice/generate (internal-only, KHÔNG qua gateway).

Lỗi theo invoice.yaml: 400 payload thiếu trường (pydantic) · 503 renderer lỗi
(degraded rõ ràng — caller (ordering) KHÔNG tự sinh PDF thay thế).
"""

import logging
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

from .models import InvoicePayload
from .renderer import render_pdf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("invoice-service")

app = FastAPI(
    title="Invoice API (internal)",
    description="Renderer PDF hóa đơn VN (D18) — stateless, không giữ business data.",
    version="1.0.0",
)


@app.get("/actuator/health")
@app.get("/health")
def health() -> dict:
    """Compose healthcheck + sanity — service stateless, luôn UP khi process sống."""
    return {"status": "UP"}


def _problem(status: int, title: str, detail: str) -> JSONResponse:
    """RFC 7807 problem+json — mirror common-lib ApiError của backend."""
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": title,
            "status": status,
            "detail": detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.post("/api/invoice/generate")
async def generate(request: Request) -> Response:
    body = await request.body()
    try:
        payload = InvoicePayload.model_validate_json(body)
    except Exception as e:
        # 400 — payload thiếu trường bắt buộc (invoice.yaml: validate bằng pydantic)
        log.warning("Payload invalidate: %s", e)
        return _problem(400, "Bad Request", f"Payload hóa đơn không hợp lệ: {e}")

    try:
        pdf = render_pdf(payload)
    except Exception as e:  # noqa: BLE001 — renderer crash = 503 degraded rõ ràng
        log.exception("Renderer lỗi")
        return _problem(503, "Service Unavailable", f"Không render được hóa đơn: {e}")

    return Response(content=pdf, media_type="application/pdf")
