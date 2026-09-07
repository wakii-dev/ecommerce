package com.ecommerce.ordering.api;

/** lines của RMA không khớp đơn (lineId lạ / qty vượt line) — 400 contract. */
public class InvalidRmaLinesException extends RuntimeException {

    public InvalidRmaLinesException(String message) {
        super(message);
    }
}
