package com.ecommerce.catalog.domain;

import jakarta.persistence.Embeddable;

/**
 * i18n JSONB value {@code {vi, en}} (D17) — map 1-1 cột jsonb của V10.
 * Field giữ I18nText phải đánh dấu {@code @JdbcTypeCode(SqlTypes.JSON)}
 * (annotation chỉ áp dụng FIELD/METHOD, không áp dụng được trên record).
 *
 * <p>Resolve (Conventions #4): {@code locale != vi && en non-blank → en},
 * mọi trường hợp thiếu khác → fallback {@code vi}.</p>
 */
@Embeddable
public record I18nText(String vi, String en) {

    public I18nText {
        java.util.Objects.requireNonNull(vi, "vi phải có — fallback mọi locale (D17)");
    }

    /**
     * Resolve theo locale yêu cầu; thiếu bản dịch → trả {@code vi}.
     */
    public String resolve(String locale) {
        return ("en".equalsIgnoreCase(locale) && en != null && !en.isBlank()) ? en : vi;
    }
}
