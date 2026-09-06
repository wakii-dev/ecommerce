package com.ecommerce.catalog.seed;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import com.ecommerce.catalog.AbstractIntegrationTest;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ProductVariantRepository;
import com.ecommerce.catalog.search.SearchEngine;

/**
 * IT SeedDataRunner (Task 9): chạy runner THẬT trên context bật seed
 * (base tắt → override = true), assert 24 products + cây category bilingual,
 * phân bố flash/official/compare, idempotency (chạy lại không doubling) và
 * flash-refresh bump khi tất cả flash rows đã quá hạn (Q12).
 */
@TestPropertySource(properties = {
    "catalog.seed.enabled=true", // override base (inlined properties của subclass THAY base)
    "elasticsearch.uri=",        // PgFts trực tiếp, không ping ES 2s
    // base inline bị thay → khai báo lại 2 default AMQP (Task 5)
    "outbox.relay.enabled=false",
    "spring.rabbitmq.listener.simple.auto-startup=false"
})
class SeedDataRunnerTest extends AbstractIntegrationTest {

    @Autowired
    SeedDataRunner runner;
    @Autowired
    ProductRepository products;
    @Autowired
    CategoryRepository categories;
    @Autowired
    ProductImageRepository images;
    @Autowired
    ProductVariantRepository variants;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    SearchEngine searchEngine;

    @BeforeEach
    void wipe() {
        variants.deleteAll();
        images.deleteAll();
        products.deleteAll();
        // Self-FK parent_id: xóa CON trước CHA (pattern ProductApiTest)
        jdbc.update("DELETE FROM categories WHERE parent_id IS NOT NULL");
        jdbc.update("DELETE FROM categories WHERE parent_id IS NULL");
    }

    private void runSeed() {
        runner.run(new DefaultApplicationArguments(new String[0]));
    }

    @Test
    void seed24ProductsVaCayCategoriesBilingual() {
        runSeed();

        assertThat(products.count()).isEqualTo(24);

        // categories: đủ node (6 gốc + con), 6 gốc parent null
        int expectedNodes = countNodes(SeedData.categories());
        assertThat(categories.count()).isEqualTo(expectedNodes);
        List<com.ecommerce.catalog.domain.CategoryEntity> roots = categories.findAll().stream()
            .filter(c -> c.getParentId() == null).toList();
        assertThat(roots).hasSize(6);
        assertThat(roots).allSatisfy(c -> {
            assertThat(c.getName().vi()).isNotBlank();
            assertThat(c.getName().en()).isNotBlank();
            assertThat(c.getIcon()).isNotBlank();
        });

        // mỗi product: bilingual vi+en, slug distinct, giá trong dải, rating 3.5-5.0
        List<ProductEntity> all = products.findAll();
        assertThat(all).extracting(p -> p.getName().vi()).allSatisfy(vi -> assertThat(vi).isNotBlank());
        assertThat(all).extracting(p -> p.getName().en()).allSatisfy(en -> assertThat(en).isNotBlank());
        assertThat(all).extracting(ProductEntity::getSlugVi).doesNotHaveDuplicates();
        assertThat(all).extracting(ProductEntity::getSlugEn).doesNotHaveDuplicates();
        assertThat(all).allSatisfy(p -> {
            assertThat(p.getPrice()).isBetween(290_000L, 24_990_000L);
            assertThat(p.getStatus()).isEqualTo(com.ecommerce.catalog.domain.ProductStatus.PUBLISHED);
            double rating = p.getRatingAvg() == null ? 0 : p.getRatingAvg().doubleValue();
            assertThat(rating).isBetween(3.5, 5.0);
            assertThat(p.getRatingCount()).isBetween(5, 2500);
            assertThat(p.getDescription().vi()).isNotBlank();
            assertThat(p.getDescription().en()).isNotBlank();
            assertThat(images.findByProductIdOrderByPositionAsc(p.getId()).size()).isGreaterThanOrEqualTo(2);
        });

        // phân bố: 3-4 flash TƯƠNG LAI, 6-8 compare, ~nửa official
        Instant now = Instant.now();
        List<ProductEntity> flash = all.stream().filter(p -> p.getFlashSaleEndsAt() != null).toList();
        assertThat(flash).hasSizeBetween(3, 4);
        assertThat(flash).allSatisfy(p -> assertThat(p.getFlashSaleEndsAt()).isAfter(now));
        long withCompare = all.stream().filter(p -> p.getComparePrice() != null && p.getComparePrice() > p.getPrice()).count();
        assertThat(withCompare).isBetween(6L, 8L);
        long official = all.stream().filter(ProductEntity::isOfficial).count();
        assertThat(official).isBetween(8L, 16L);

        // variants: ~6 SP thời trang có biến thể
        long withVariants = all.stream().filter(p -> !variants.findByProductIdOrderByCreatedAtAsc(p.getId()).isEmpty()).count();
        assertThat(withVariants).isBetween(5L, 8L);

        // /c/dien-tu (gồm con) ≥ 4 products — tên dễ search
        long dienTuCount = all.stream()
            .filter(p -> categoryPathContainsDienTu(p.getCategoryId()))
            .count();
        assertThat(dienTuCount).isGreaterThanOrEqualTo(4);
        ProductEntity xiaomi = all.stream()
            .filter(p -> p.getSlugVi().equals("dien-thoai-xiaomi-redmi-13c"))
            .findFirst().orElseThrow();
        assertThat(xiaomi.getName().vi()).isEqualTo("Điện Thoại Xiaomi Redmi 13C");
        assertThat(xiaomi.getName().en()).isEqualTo("Xiaomi Redmi 13C Phone");
    }

    @Test
    void idempotentChayLaiKhongDoubling() {
        runSeed();
        long categoriesAfterFirst = categories.count();
        runSeed(); // lần 2 → skip seed
        assertThat(products.count()).isEqualTo(24);
        assertThat(categories.count()).isEqualTo(categoriesAfterFirst);
    }

    @Test
    void flashRefreshBumpKhiTatCaQuaHan() {
        runSeed();
        // đẩy mọi flash row về quá hạn
        Instant past = Instant.now().minus(Duration.ofDays(1));
        products.findByFlashSaleEndsAtIsNotNull().forEach(p -> {
            p.setFlashSaleEndsAt(past);
            products.save(p);
        });
        assertThat(products.findByFlashSaleEndsAtIsNotNull())
            .allSatisfy(p -> assertThat(p.getFlashSaleEndsAt()).isBefore(Instant.now()));

        runSeed(); // skip seed (count>0) → flash-refresh path
        List<ProductEntity> refreshed = products.findByFlashSaleEndsAtIsNotNull();
        assertThat(refreshed).isNotEmpty();
        assertThat(refreshed).allSatisfy(p -> assertThat(p.getFlashSaleEndsAt()).isAfter(Instant.now()));
    }

    @Test
    void engineChonPgfts() {
        assertThat(searchEngine.name()).isEqualTo("pg-fts");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static int countNodes(List<SeedData.CategorySeed> nodes) {
        return nodes.stream().mapToInt(n -> 1 + countNodes(n.children())).sum();
    }

    /** product → category slug_vi: node hoặc tổ tiên là dien-tu. */
    private boolean categoryPathContainsDienTu(java.util.UUID categoryId) {
        java.util.Map<java.util.UUID, com.ecommerce.catalog.domain.CategoryEntity> byId =
            categories.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(
                    com.ecommerce.catalog.domain.CategoryEntity::getId, c -> c));
        com.ecommerce.catalog.domain.CategoryEntity current = byId.get(categoryId);
        while (current != null) {
            if ("dien-tu".equals(current.getSlugVi())) {
                return true;
            }
            current = current.getParentId() == null ? null : byId.get(current.getParentId());
        }
        return false;
    }
}
