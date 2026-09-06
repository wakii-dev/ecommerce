package com.ecommerce.catalog.web.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductStatus;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Admin write product — khớp contract {@code ProductWrite} (Task 8b).
 * i18n dùng thẳng record domain {@link I18nText} (cùng shape JSONB {vi,en};
 * Jackson deserialize record — thiếu key {@code vi} → 400 qua ctor NPE →
 * HttpMessageNotReadable; {@code en} optional theo Q5b).
 *
 * <p>Mapping variant ghi (Q5c): {@code options.color/size} → cột,
 * {@code priceDelta != null} → {@code price = product.price + priceDelta}
 * (lưu tuyệt đối), {@code stock} accept-và-ignore (SF-5).</p>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ProductWriteDto(
        I18nText nameI18n,
        I18nText descriptionI18n,
        I18nText seoTitleI18n,
        I18nText seoDescriptionI18n,
        String slugVi,
        String slugEn,
        String brand,
        Long price,
        Long comparePrice,
        Instant flashSaleEndsAt,
        List<String> tags,
        UUID categoryId,
        List<ProductImageWrite> images,
        List<VariantWrite> variants,
        ProductStatus status) {

    /** Ảnh gallery write — contract {@code ProductImage} ({url bắt buộc, alt, position}). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ProductImageWrite(String url, String alt, Integer position) {
    }

    /** Biến thể write — contract {@code VariantWrite}; {@code stock} bỏ qua khi ghi (SF-5). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record VariantWrite(I18nText nameI18n, Map<String, String> options, Long priceDelta, Integer stock) {
    }
}
