package com.ecommerce.ordering.api;

/**
 * Option contract cho phép nhưng chưa thuộc scope SF (COD D21 → SF-13, điểm
 * thưởng D22 → SF-14) → 400 rõ ràng thay vì âm thầm xử khác.
 */
public class UnsupportedFeatureException extends RuntimeException {

    public UnsupportedFeatureException(String message) {
        super(message);
    }
}
