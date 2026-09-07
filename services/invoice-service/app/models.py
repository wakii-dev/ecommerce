"""Pydantic models — mirror `contracts/openapi/invoice.yaml` (freeze SF-2).

Caller (ordering-service) gửi payload ĐÃ TÍNH: breakdown VAT-inclusive,
số hóa đơn tuần tự do caller cấp. Renderer chỉ validate + vẽ PDF.
"""

from pydantic import BaseModel, Field


class InvoiceItem(BaseModel):
    """Dòng hàng — giá trị đã tính VAT-inclusive từ caller."""

    name: str = Field(min_length=1)
    qty: int = Field(ge=1)
    unitPrice: int = Field(ge=0, description="Đơn giá VND (đã gồm phần VAT của dòng)")
    lineTotal: int = Field(ge=0, description="qty x unitPrice (VND)")


class OrderRef(BaseModel):
    id: str = Field(min_length=1)
    number: str | None = Field(default=None, description="Mã đơn hiển thị nếu khác id")
    createdAt: str = Field(min_length=1)
    items: list[InvoiceItem] = Field(min_length=1)


class Seller(BaseModel):
    name: str
    address: str
    phone: str | None = None
    taxId: str | None = None


class Buyer(BaseModel):
    name: str
    address: str
    phone: str | None = None
    taxId: str | None = None


class InvoiceInfo(BaseModel):
    templateSymbol: str = Field(description="Ký hiệu mẫu hóa đơn")
    seriesSymbol: str = Field(description="Ký hiệu série hóa đơn")
    number: int = Field(ge=1, description="Số hóa đơn tuần tự do caller cấp")
    vatRate: float = Field(ge=0, le=100, description="Thuế suất % (INVOICE_VAT_RATE)")
    totalAmount: int = Field(ge=0, description="Tổng tiền hóa đơn VND (đã gồm VAT)")
    note: str | None = None


class InvoicePayload(BaseModel):
    order: OrderRef
    seller: Seller
    buyer: Buyer
    invoice: InvoiceInfo
