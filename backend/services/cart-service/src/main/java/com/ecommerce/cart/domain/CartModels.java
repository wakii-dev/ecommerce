package com.ecommerce.cart.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Model nội bộ giỏ hàng (lưu Redis dạng JSON) — SF-6.
 *
 * <p>{@link LineItem} là SNAPSHOT: slug/name/image/unitPrice lưu để enrich
 * chết (catalog down) vẫn còn cái hiển thị; mỗi GET/ghi vẫn refresh từ catalog
 * qua slug hint (authority giá là re-price của ordering lúc POST /orders —
 * §6.1.1, cart chỉ là duyệt).</p>
 *
 * <p>Line identity = {@code productId + (variantId ?? null)} — pin §6.1.4
 * (variant-level); product non-variant (amendment A1) có variantId null.</p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CartModels {

    private CartModels() {
    }

    /** 1 dòng hàng trong giỏ — id là UUID server sinh (dùng cho PATCH/DELETE). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LineItem(
            UUID id,
            UUID productId,
            UUID variantId,
            int qty,
            String slug,
            String name,
            String image,
            long unitPrice,
            boolean unavailable) {

        /** Line identity — dedupe khi add/merge (cộng qty, không tạo dòng mới). */
        public boolean sameLine(LineItem other) {
            return productId.equals(other.productId) && Objects.equals(variantId, other.variantId);
        }

        public LineItem withQty(int newQty) {
            return new LineItem(id, productId, variantId, newQty, slug, name, image, unitPrice, unavailable);
        }

        public long lineTotal() {
            return (long) qty * unitPrice;
        }
    }

    /** Document giỏ lưu Redis — key {@code cart:guest:{token}} / {@code cart:user:{sub}}. */
    public record CartDocument(List<LineItem> items, Instant updatedAt) {

        public static CartDocument empty() {
            return new CartDocument(new ArrayList<>(), Instant.now());
        }

        public CartDocument {
            items = items == null ? new ArrayList<>() : new ArrayList<>(items);
        }

        public CartDocument withItems(List<LineItem> items) {
            return new CartDocument(items, Instant.now());
        }
    }
}
