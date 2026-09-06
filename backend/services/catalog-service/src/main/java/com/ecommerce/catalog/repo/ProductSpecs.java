package com.ecommerce.catalog.repo;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Locale;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;

/**
 * Filters dùng chung cho list public (Task 3) — tái dùng bởi search engines
 * (Task 4/6 hydrate cũng lọc cùng bộ điều kiện).
 */
public final class ProductSpecs {

    private ProductSpecs() {
    }

    /** Chỉ hàng public: PUBLISHED + chưa soft-delete. */
    public static Specification<ProductEntity> published() {
        return (root, query, cb) -> cb.and(
            cb.equal(root.get("status"), ProductStatus.PUBLISHED),
            cb.isNull(root.get("deletedAt")));
    }

    /** Filter theo danh mục — truyền vào cả descendants (node gốc + con). */
    public static Specification<ProductEntity> inCategories(Collection<UUID> categoryIds) {
        return (root, query, cb) -> root.get("categoryId").in(categoryIds);
    }

    public static Specification<ProductEntity> priceAtLeast(long min) {
        return (root, query, cb) -> cb.ge(root.get("price"), min);
    }

    public static Specification<ProductEntity> priceAtMost(long max) {
        return (root, query, cb) -> cb.le(root.get("price"), max);
    }

    public static Specification<ProductEntity> ratingAtLeast(BigDecimal min) {
        return (root, query, cb) -> cb.ge(root.get("ratingAvg"), min);
    }

    /** Brand khớp không phân biệt hoa thường (PLP text input). */
    public static Specification<ProductEntity> brandEquals(String brand) {
        return (root, query, cb) -> cb.equal(cb.lower(root.get("brand")), brand.toLowerCase(Locale.ROOT));
    }

    /** Badge Chính hãng — GAP FLAGGED: không có trong contract, implement theo pack. */
    public static Specification<ProductEntity> official(boolean official) {
        return (root, query, cb) -> cb.equal(root.get("official"), official);
    }
}
