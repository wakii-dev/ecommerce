package com.ecommerce.ordering.api;

/** Service phụ thuộc (inventory/payment) lỗi hạ tầng sau khi order đã tạo → 502 + saga đã compensation. */
public class ExternalUnavailableException extends RuntimeException {

    public ExternalUnavailableException(String message) {
        super(message);
    }
}
