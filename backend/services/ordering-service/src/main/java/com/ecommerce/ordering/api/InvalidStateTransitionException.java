package com.ecommerce.ordering.api;

/** Transition trái state machine §3.6 (admin ship/cancel sai trạng thái, cancel đơn đã PAID...) → 409. */
public class InvalidStateTransitionException extends RuntimeException {

    public InvalidStateTransitionException(String message) {
        super(message);
    }
}
