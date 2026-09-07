package com.ecommerce.ordering.service.invoice;

import com.ecommerce.ordering.api.InvoiceUnavailableException;
import com.ecommerce.ordering.domain.Order;

/**
 * SPI hóa đơn (D18) — business truth (số HĐ, dữ liệu) thuộc ordering; renderer
 * là Python stateless. Default impl {@link HttpInvoiceProvider} gọi
 * invoice-service :8090. Đổi renderer sau (nhà cung cấp e-invoice VN thật) =
 * implementation mới, endpoints/khách hàng không đổi.
 */
public interface InvoiceProvider {

    /**
     * Sinh PDF cho đơn — cùng đơn gọi NHIỀU lần → CÙNG số HĐ (cấp số 1 lần,
     * cache trên order row). Renderer chết → {@link InvoiceUnavailableException}
     * (503 degraded rõ ràng, KHÔNG crash ordering).
     */
    byte[] generate(Order order);
}
