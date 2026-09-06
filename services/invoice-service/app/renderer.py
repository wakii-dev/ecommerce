"""ReportLab renderer — layout hóa đơn VN (D18).

STATELESS: mọi số liệu nhận từ payload (caller đã tính VAT breakdown); tại đây
chỉ chia dòng VAT ra ĐỂ HIỂN THỊ (per-line VAT = lineTotal × rate/(100+rate),
giống công thức note của caller). Font: DejaVu (bundled assets/ hoặc
fonts-dejavu-core trong container) — đủ dấu tiếng Việt; thiếu font → Helvetica
(degraded, không crash).
"""

import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

_FONT_CANDIDATES = [
    # env override trước (compose/host khác nhau)
    os.environ.get("INVOICE_FONT_PATH", ""),
    # bundled trong repo (assets vendored — license DejaVu kèm assets/LICENSE)
    os.path.join(os.path.dirname(__file__), "..", "assets", "DejaVuSans.ttf"),
    os.path.join(os.path.dirname(__file__), "..", "assets", "DejaVuSans-Bold.ttf"),
    # fonts-dejavu-core (Dockerfile python:3.12-slim cài)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _register_fonts() -> tuple[str, str]:
    """Đăng ký DejaVu regular+bold; trả (regular, bold). Fallback Helvetica."""
    regular_candidates = [p for p in _FONT_CANDIDATES if p and p.endswith("DejaVuSans.ttf")]
    bold_candidates = [p for p in _FONT_CANDIDATES if p and p.endswith("DejaVuSans-Bold.ttf")]
    try:
        regular_path = next(p for p in regular_candidates if os.path.exists(p))
        regular = "DejaVuSans"
        pdfmetrics.registerFont(TTFont(regular, regular_path))
        bold_path = next(p for p in bold_candidates if os.path.exists(p))
        bold = "DejaVuSans-Bold"
        pdfmetrics.registerFont(TTFont(bold, bold_path))
        return regular, bold
    except StopIteration:
        return "Helvetica", "Helvetica-Bold"


_REGULAR, _BOLD = _register_fonts()

_DEMO_DISCLAIMER = "Bản demo — không phải hóa đơn chữ ký số"


def _vat_of(amount: int, vat_rate: float) -> int:
    """VAT ẩn trong số tiền VAT-inclusive: amount × rate/(100+rate)."""
    return round(amount * vat_rate / (100.0 + vat_rate))


def _vnd(amount: int) -> str:
    return f"{amount:,.0f}".replace(",", ".") + "đ"


def render_pdf(payload) -> bytes:
    """Vẽ PDF hóa đơn VN từ InvoicePayload (pydantic) → bytes."""
    import io

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm,
        leftMargin=16 * mm, rightMargin=16 * mm, title=f"Hoa don {payload.invoice.number}")

    styles = {
        "title": ParagraphStyle("title", fontName=_BOLD, fontSize=16, alignment=1, leading=20),
        "meta": ParagraphStyle("meta", fontName=_REGULAR, fontSize=9, alignment=1, leading=12),
        "section": ParagraphStyle("section", fontName=_BOLD, fontSize=10.5, leading=14),
        "cell": ParagraphStyle("cell", fontName=_REGULAR, fontSize=9.5, leading=12),
        "note": ParagraphStyle("note", fontName=_REGULAR, fontSize=8.5, leading=11, textColor=colors.HexColor("#555555")),
        "disclaimer": ParagraphStyle(
            "disclaimer", fontName=_BOLD, fontSize=9, leading=12,
            alignment=1, textColor=colors.HexColor("#B45309")),
    }

    story: list = []
    inv = payload.invoice

    # ── Header: tiêu đề + thông tin mẫu/série/số ─────────────────────────────
    story.append(Paragraph("HÓA ĐƠN GIÁ TRỊ GIA TĂNG", styles["title"]))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        f"Mẫu số: {inv.templateSymbol} — Ký hiệu: {inv.seriesSymbol} — Số: {inv.number:06d} "
        f"(liên 1: lưu khách hàng)", styles["meta"]))
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#0F766E")))
    story.append(Spacer(1, 4 * mm))

    # ── Người bán / Người mua 2 cột ─────────────────────────────────────────
    seller_lines = [f"<b>{payload.seller.name}</b>", payload.seller.address]
    if payload.seller.phone:
        seller_lines.append(f"ĐT: {payload.seller.phone}")
    if payload.seller.taxId:
        seller_lines.append(f"MST: {payload.seller.taxId}")
    buyer_lines = [f"<b>{payload.buyer.name}</b>", payload.buyer.address]
    if payload.buyer.phone:
        buyer_lines.append(f"ĐT: {payload.buyer.phone}")
    if payload.buyer.taxId:
        buyer_lines.append(f"MST: {payload.buyer.taxId}")
    party_table = Table(
        [[Paragraph("NGƯỜI BÁN", styles["section"]),
          Paragraph("NGƯỜI MUA", styles["section"])],
         [Paragraph("<br/>".join(seller_lines), styles["cell"]),
          Paragraph("<br/>".join(buyer_lines), styles["cell"])]],
        colWidths=[89 * mm, 89 * mm])
    party_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
    ]))
    story.append(party_table)
    story.append(Spacer(1, 5 * mm))

    # ── Bảng hàng hóa (giá đã gồm VAT) ───────────────────────────────────────
    header = ["STT", "Tên hàng hóa, dịch vụ", "SL", "Đơn giá", "Thành tiền"]
    rows: list[list] = [header]
    for idx, item in enumerate(payload.order.items, start=1):
        rows.append([str(idx), item.name, str(item.qty),
                     _vnd(item.unitPrice), _vnd(item.lineTotal)])
    item_table = Table(rows, colWidths=[12 * mm, 82 * mm, 14 * mm, 35 * mm, 35 * mm])
    item_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), _BOLD),
        ("FONTNAME", (0, 1), (-1, -1), _REGULAR),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E6F4F1")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 4 * mm))

    # ── Tổng kết + VAT breakdown (per-line VAT = lineTotal × rate/(100+rate)) ──
    goods_total = sum(item.lineTotal for item in payload.order.items)
    vat_total = sum(_vat_of(item.lineTotal, inv.vatRate) for item in payload.order.items)
    summary_rows: list[list] = [
        ["Tổng tiền hàng hóa, dịch vụ:", _vnd(goods_total)],
        [f"Thuế GTGT {inv.vatRate:g}% (đã bao gồm trong giá):", _vnd(vat_total)],
        ["TỔNG CỘNG THANH TOÁN:", _vnd(inv.totalAmount)],
    ]
    summary = Table(summary_rows, colWidths=[110 * mm, 68 * mm], hAlign="RIGHT")
    summary.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _REGULAR),
        ("FONTNAME", (0, 2), (-1, 2), _BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 2), (-1, 2), 0.8, colors.HexColor("#0F766E")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(summary)

    if inv.note:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(inv.note, styles["note"]))
    if payload.order.number:
        story.append(Paragraph(f"Mã đơn hàng tham chiếu: {payload.order.number}", styles["note"]))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(_DEMO_DISCLAIMER, styles["disclaimer"]))

    doc.build(story, onFirstPage=lambda c, d: None, onLaterPages=lambda c, d: PageBreak)
    return buf.getvalue()
