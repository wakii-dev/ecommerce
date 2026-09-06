package com.ecommerce.catalog.reviews;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

import com.ecommerce.catalog.AbstractIntegrationTest;

/**
 * IT Flyway V11 (SF-8) — 3 bảng reviews/review_eligibility/wishlist_items +
 * UNIQUE(user_id, product_id) trên reviews (policy 1 review/user/product —
 * spec Q3/Q4) + indexes. Tách khỏi {@code CatalogFlywayMigrationTest} của
 * SF-4 (file-slice — không sửa test người khác).
 */
class ReviewsWishlistMigrationTest extends AbstractIntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    private int tableCount(String name) {
        return jdbc.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = ?", Integer.class, name);
    }

    @Test
    void v11BaBangMigrateSach() {
        assertThat(tableCount("reviews")).isEqualTo(1);
        assertThat(tableCount("review_eligibility")).isEqualTo(1);
        assertThat(tableCount("wishlist_items")).isEqualTo(1);
    }

    @Test
    void v11UniqueUserProductTrenReviews() {
        Integer count = jdbc.queryForObject("""
            SELECT count(*) FROM pg_constraint
            WHERE conname = 'uq_reviews_user_product' AND contype = 'u'
            """, Integer.class);
        assertThat(count).isEqualTo(1);
    }

    @Test
    void v11CheckRating1To5VaStatus() {
        // rating ngoài 1..5 phải bị CHECK chặn
        assertThat(jdbc.queryForObject("""
            SELECT count(*) FROM pg_constraint
            WHERE conrelid = 'reviews'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%%rating%%'
            """, Integer.class)).isGreaterThanOrEqualTo(1);
        Integer statusCheck = jdbc.queryForObject("""
            SELECT count(*) FROM pg_constraint
            WHERE conrelid = 'reviews'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%%PENDING%%'
            """, Integer.class);
        assertThat(statusCheck).isEqualTo(1);
    }

    @Test
    void v11FkVeProductsVaIndexes() {
        Integer fkReviews = jdbc.queryForObject("""
            SELECT count(*) FROM pg_constraint
            WHERE conrelid = 'reviews'::regclass AND contype = 'f'
              AND confrelid = 'products'::regclass
            """, Integer.class);
        Integer fkEligibility = jdbc.queryForObject("""
            SELECT count(*) FROM pg_constraint
            WHERE conrelid = 'review_eligibility'::regclass AND contype = 'f'
              AND confrelid = 'products'::regclass
            """, Integer.class);
        Integer fkWishlist = jdbc.queryForObject("""
            SELECT count(*) FROM pg_constraint
            WHERE conrelid = 'wishlist_items'::regclass AND contype = 'f'
              AND confrelid = 'products'::regclass
            """, Integer.class);
        assertThat(fkReviews).isEqualTo(1);
        assertThat(fkEligibility).isEqualTo(1);
        assertThat(fkWishlist).isEqualTo(1);

        Integer idxProductStatusCreated = jdbc.queryForObject("""
            SELECT count(*) FROM pg_indexes
            WHERE tablename = 'reviews' AND indexname = 'idx_reviews_product_status_created'
            """, Integer.class);
        Integer idxUserCreated = jdbc.queryForObject("""
            SELECT count(*) FROM pg_indexes
            WHERE tablename = 'reviews' AND indexname = 'idx_reviews_user_created'
            """, Integer.class);
        assertThat(idxProductStatusCreated).isEqualTo(1);
        assertThat(idxUserCreated).isEqualTo(1);
    }
}
