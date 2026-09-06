package com.ecommerce.partner.domain;

/** Trạng thái partner — SUSPENDED: key vô hiệu (auth 401) + skip webhook delivery. */
public enum PartnerStatus {
    ACTIVE,
    SUSPENDED
}
