"""pytest invoice-service (pack item 7: scaffold có pytest; ACCEPTANCE D18:
curl POST /generate → PDF; PDF có đủ trường + VAT breakdown; demo disclaimer)."""

import json
import re

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def payload(**overrides) -> dict:
    """Payload hợp lệ mẫu — mirror invoice.yaml InvoicePayload."""
    base = {
        "order": {
            "id": "9f1c2f2e-1111-4e0a-9c1d-0a2b3c4d5e6f",
            "number": "#9F1C2F2E",
            "createdAt": "2026-09-06T10:00:00Z",
            "items": [
                {"name": "Áo thun nam tay lửng", "qty": 2, "unitPrice": 150_000, "lineTotal": 300_000},
                {"name": "Quần jeans nữ ống rộng", "qty": 1, "unitPrice": 499_000, "lineTotal": 499_000},
            ],
        },
        "seller": {
            "name": "Cửa hàng Demo Ecommerce",
            "address": "123 Đường Thử Nghiệm, Quận 1, TP. Hồ Chí Minh",
            "phone": "028 1234 5678",
            "taxId": "0312345678",
        },
        "buyer": {
            "name": "Nguyễn Văn A",
            "address": "45 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
            "phone": "0901234567",
        },
        "invoice": {
            "templateSymbol": "01/001",
            "seriesSymbol": "C26",
            "number": 1,
            "vatRate": 10,
            "totalAmount": 799_000,
            "note": "Thuế GTGT 10%: 72.636đ (đã bao gồm trong tổng tiền)",
        },
    }
    base.update(overrides)
    return base


def _text_of_pdf(pdf_bytes: bytes) -> str:
    """Trích text PDF (pypdf) — assert nội dung hóa đơn thật, không chỉ magic bytes."""
    from pypdf import PdfReader
    import io

    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_health_up():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "UP"


def test_generate_returns_valid_pdf_with_vn_fields():
    response = client.post("/api/invoice/generate", json=payload())
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    pdf = response.content
    assert pdf[:5] == b"%PDF-", "body phải là PDF thật"
    assert len(pdf) > 1_000, "PDF 2 dòng hàng không thể chỉ vài trăm bytes"

    text = _text_of_pdf(pdf)
    # Đủ trường hóa đơn VN (ACCEPTANCE D18: "PDF có đủ trường")
    assert "HÓA ĐƠN GIÁ TRỊ GIA TĂNG" in text
    assert "Mẫu số: 01/001" in text
    assert "Ký hiệu: C26" in text
    assert "000001" in text  # số HĐ 6 chữ số
    assert "Cửa hàng Demo Ecommerce" in text
    assert "Nguyễn Văn A" in text
    assert "Áo thun nam tay lửng" in text
    # VAT breakdown: 10% VAT-inclusive của 799.000 = 72.636đ
    assert "72.636đ" in text
    assert "799.000đ" in text
    # D18 disclaimer bắt buộc
    assert "Bản demo — không phải hóa đơn chữ ký số" in text


def test_generate_renders_consecutive_numbers():
    """Renderer stateless — số HĐ do caller truyền, in đúng số được cấp."""
    first = client.post("/api/invoice/generate", json=payload()).content
    second_payload = payload()
    second_payload["invoice"]["number"] = 2
    second = client.post("/api/invoice/generate", json=second_payload).content

    assert b"000001" in first
    assert b"000002" in second


def test_missing_required_field_returns_400():
    body = payload()
    del body["invoice"]["number"]  # bắt buộc theo invoice.yaml
    response = client.post("/api/invoice/generate", json=body)
    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    problem = response.json()
    assert problem["title"] == "Bad Request"
    assert problem["status"] == 400


def test_empty_items_returns_400():
    body = payload()
    body["order"]["items"] = []
    response = client.post("/api/invoice/generate", json=body)
    assert response.status_code == 400


def test_garbage_body_returns_400():
    response = client.post(
        "/api/invoice/generate",
        content=b"not-json",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400


def test_xml_special_chars_in_names_render():
    """Review SF-9 P1: Paragraph parse mini-HTML — '&'/'<' trong tên SP/tên
    khách phải render được (escape), không crash → 503."""
    body = payload()
    body["order"]["items"][0]["name"] = "Tai nghe & sạc nhanh <USB-C>"
    body["buyer"]["name"] = "Cty TNHH A&B <Chi nhánh Q1>"
    body["invoice"]["note"] = "Ghi chú & nhắc <thuế>"
    response = client.post("/api/invoice/generate", json=body)
    assert response.status_code == 200, "tên có XML-special chars không được crash"
    text = _text_of_pdf(response.content)
    assert "Tai nghe & sạc nhanh <USB-C>" in text
    assert "Cty TNHH A&B <Chi nhánh Q1>" in text
    assert "Ghi chú & nhắc <thuế>" in text
