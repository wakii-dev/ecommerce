package com.ecommerce.catalog.seed;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ProductVariantEntity;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ProductVariantRepository;
import com.ecommerce.catalog.search.SearchEngine;

/**
 * Seed Tiki-style bilingual (Task 9, spec Q12): 6 gốc category + con, 24
 * products. Idempotent — products đã có → skip seed (category vẫn ensure theo
 * slug). Flash-refresh chạy MỖI startup khi bỏ qua seed: nếu có flash rows và
 * TẤT CẢ đã quá hạn → bump +2 ngày (chống acceptance countdown chết khi verify
 * trễ). Sau seed → {@code searchEngine.reindexAll()} (§5.9; PgFts no-op,
 * EsEngine Task 5 đẩy docs). @Order(1) — TRƯỚC StartupReindexRunner (@Order(2)).
 * IT tắt qua {@code catalog.seed.enabled=false} (base test) — runner riêng test
 * ở SeedDataRunnerTest bật lại = true.
 */
@Component
@ConditionalOnProperty(name = "catalog.seed.enabled", havingValue = "true", matchIfMissing = true)
@Order(1)
public class SeedDataRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedDataRunner.class);

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ProductImageRepository imageRepository;
    private final ProductVariantRepository variantRepository;
    private final SearchEngine searchEngine;
    private final TransactionTemplate tx;

    public SeedDataRunner(ProductRepository productRepository, CategoryRepository categoryRepository,
                          ProductImageRepository imageRepository, ProductVariantRepository variantRepository,
                          SearchEngine searchEngine, TransactionTemplate tx) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.imageRepository = imageRepository;
        this.variantRepository = variantRepository;
        this.searchEngine = searchEngine;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean wrote;
        if (productRepository.count() > 0) {
            log.info("Seed BỎ QUA — products đã có dữ liệu (idempotent, count={})", productRepository.count());
            wrote = refreshExpiredFlashSales();
        } else {
            seedAll();
            wrote = true;
        }
        if (wrote) {
            // Sau commit — PgFtsEngine no-op; EsEngine (Task 5) bulk index toàn bộ published
            searchEngine.reindexAll();
        }
    }

    /** Seed categories + products trong 1 tx — all-or-nothing. */
    private void seedAll() {
        tx.executeWithoutResult(status -> {
            Map<String, CategoryEntity> bySlug = new HashMap<>();
            for (SeedData.CategorySeed root : SeedData.categories()) {
                insertCategory(root, null, bySlug);
            }
            Instant flashEndsAt = Instant.now().plus(Duration.ofDays(2)); // Q12: flash = now + 2 ngày lúc seed
            for (SeedData.ProductSeed ps : SeedData.products()) {
                ProductEntity p = new ProductEntity();
                p.setName(new I18nText(ps.nameVi(), ps.nameEn()));
                p.setSlugVi(ps.slugVi());
                p.setSlugEn(ps.slugEn());
                p.setDescription(new I18nText(ps.descVi(), ps.descEn()));
                p.setBrand(ps.brand());
                p.setCategoryId(bySlug.get(ps.categorySlugVi()).getId());
                p.setStatus(ProductStatus.PUBLISHED);
                p.setPrice(ps.price());
                p.setComparePrice(ps.comparePrice());
                p.setFlashSaleEndsAt(ps.flash() ? flashEndsAt : null);
                p.setOfficial(ps.official());
                p.setTags(ps.tags());
                p.setRatingAvg(new java.math.BigDecimal(ps.ratingAvg()));
                p.setRatingCount(ps.ratingCount());
                productRepository.save(p);

                for (SeedData.ImageSeed img : ps.images()) {
                    ProductImageEntity image = new ProductImageEntity();
                    image.setProductId(p.getId());
                    image.setUrl(img.url());
                    image.setAlt(img.alt());
                    image.setPosition(img.position());
                    imageRepository.save(image);
                }
                for (SeedData.VariantSeed vs : ps.variants()) {
                    ProductVariantEntity v = new ProductVariantEntity();
                    v.setProductId(p.getId());
                    v.setNameI18n(vs.nameVi() == null ? null : new I18nText(vs.nameVi(), vs.nameEn()));
                    v.setColor(vs.color());
                    v.setSize(vs.size());
                    v.setPrice(vs.price());
                    v.setSkuCode(("SKU-" + ps.slugVi() + "-" + vs.color() + "-" + vs.size()).toUpperCase());
                    variantRepository.save(v);
                }
            }
            log.info("Seed xong: {} categories, {} products, engine={}",
                bySlug.size(), productRepository.count(), searchEngine.name());
        });
    }

    /** Insert đệ quy — idempotent theo slug_vi (reuse khi row đã tồn tại). */
    private void insertCategory(SeedData.CategorySeed node, UUID parentId, Map<String, CategoryEntity> bySlug) {
        CategoryEntity saved = bySlug.computeIfAbsent(node.slugVi(), slug ->
            categoryRepository.findBySlugViOrSlugEn(slug, slug).orElseGet(() -> {
                CategoryEntity c = new CategoryEntity();
                c.setName(new I18nText(node.vi(), node.en()));
                c.setSlugVi(node.slugVi());
                c.setSlugEn(node.slugEn());
                c.setParentId(parentId);
                c.setIcon(node.icon());
                return categoryRepository.save(c);
            }));
        for (SeedData.CategorySeed child : node.children()) {
            insertCategory(child, saved.getId(), bySlug);
        }
    }

    /**
     * Flash-refresh (Q12): chỉ khi tồn tại flash rows và TẤT CẢ đã &lt; now →
     * bump tất cả lên now + 2 ngày. Mixed (có row còn active) → không đụng.
     *
     * @return true nếu đã ghi DB (cần reindex)
     */
    private boolean refreshExpiredFlashSales() {
        List<ProductEntity> flashRows = productRepository.findByFlashSaleEndsAtIsNotNull();
        if (flashRows.isEmpty()) {
            return false;
        }
        Instant now = Instant.now();
        if (!flashRows.stream().allMatch(p -> p.getFlashSaleEndsAt().isBefore(now))) {
            return false; // còn row active → seed gần đây, không bump
        }
        Instant bumped = now.plus(Duration.ofDays(2));
        tx.executeWithoutResult(status -> flashRows.forEach(p -> {
            p.setFlashSaleEndsAt(bumped);
            productRepository.save(p);
        }));
        log.info("Flash-refresh: {} product flash_sale_ends_at đã hết hạn → bump tới {} (Q12)", flashRows.size(), bumped);
        return true;
    }
}
