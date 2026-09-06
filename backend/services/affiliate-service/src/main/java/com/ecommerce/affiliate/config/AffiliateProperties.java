package com.ecommerce.affiliate.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

/**
 * Config affiliate (application.yml block {@code affiliate}) — rate mặc định,
 * salt hash click, cửa sổ dedupe, cookie attribution.
 */
@ConfigurationProperties(prefix = "affiliate")
public class AffiliateProperties {

    /** Rate mặc định (%) khi approve — env AFFILIATE_DEFAULT_RATE=5 (pack D20). */
    private BigDecimal defaultRate = new BigDecimal("5");

    /** Salt hash ip/user-agent cho clicks (không lưu PII thô). */
    private String hashSalt = "dev-affiliate-salt";

    /** Cửa sổ dedupe ghi nhận click (phút) — pack: 1 click/IP/10'. */
    private int clickDedupeMinutes = 10;

    private String cookieName = "aff_ref";

    /** Cookie attribution 30 ngày (giây). */
    private long cookieMaxAgeSeconds = 2_592_000;

    public BigDecimal getDefaultRate() {
        return defaultRate;
    }

    public void setDefaultRate(BigDecimal defaultRate) {
        this.defaultRate = defaultRate;
    }

    public String getHashSalt() {
        return hashSalt;
    }

    public void setHashSalt(String hashSalt) {
        this.hashSalt = hashSalt;
    }

    public int getClickDedupeMinutes() {
        return clickDedupeMinutes;
    }

    public void setClickDedupeMinutes(int clickDedupeMinutes) {
        this.clickDedupeMinutes = clickDedupeMinutes;
    }

    public String getCookieName() {
        return cookieName;
    }

    public void setCookieName(String cookieName) {
        this.cookieName = cookieName;
    }

    public long getCookieMaxAgeSeconds() {
        return cookieMaxAgeSeconds;
    }

    public void setCookieMaxAgeSeconds(long cookieMaxAgeSeconds) {
        this.cookieMaxAgeSeconds = cookieMaxAgeSeconds;
    }
}
