package com.ecommerce.affiliate.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * Click attribution (D20) — ghi nhận khi khách vào link {@code ?ref=<code>}
 * (track/click). ip/user_agent CHỈ lưu HASH salted (không PII thô);
 * dedupe ghi nhận 1 click/(code, ip_hash)/{@code click-dedupe-minutes}.
 */
@Entity
@Table(name = "clicks")
public class Click {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(nullable = false, length = 8)
    private String code;

    @Column(name = "affiliate_id", nullable = false)
    private UUID affiliateId;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt = Instant.now();

    @Column(name = "ip_hash", nullable = false, length = 64)
    private String ipHash;

    @Column(name = "user_agent_hash", length = 64)
    private String userAgentHash;

    protected Click() {
    }

    public Click(String code, UUID affiliateId, String ipHash, String userAgentHash) {
        this.code = code;
        this.affiliateId = affiliateId;
        this.ipHash = ipHash;
        this.userAgentHash = userAgentHash;
    }

    public String getCode() {
        return code;
    }

    public UUID getAffiliateId() {
        return affiliateId;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public String getIpHash() {
        return ipHash;
    }

    public String getUserAgentHash() {
        return userAgentHash;
    }
}
