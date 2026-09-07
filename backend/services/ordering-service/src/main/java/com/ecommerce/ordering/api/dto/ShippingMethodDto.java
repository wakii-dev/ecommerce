package com.ecommerce.ordering.api.dto;

/** Khớp contract ShippingMethod {id, name, fee, etaDays}. */
public record ShippingMethodDto(String id, String name, long fee, int etaDays) {
}
