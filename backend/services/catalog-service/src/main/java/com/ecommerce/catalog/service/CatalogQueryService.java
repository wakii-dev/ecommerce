package com.ecommerce.catalog.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.ecommerce.catalog.cache.CatalogCacheService;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ProductVariantEntity;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ProductSpecs;
import com.ecommerce.catalog.repo.ProductVariantRepository;
import com.ecommerce.catalog.web.dto.CategoryDto;
import com.ecommerce.catalog.web.dto.ImageRefDto;
import com.ecommerce.catalog.web.dto.ProductCardDto;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.ProductDetailDto;
import com.ecommerce.catalog.web.dto.ProductImageDto;
import com.ecommerce.catalog.web.dto.VariantDto;

/**
 * Đọc public catalog (Task 3 + Task 8): list/filter/sort/page products,
 * PDP detail, cây category. Mọi chuỗi i18n ĐÃ resolve theo locale
 * (Conventions #4) — KHÔNG trả object {vi,en} ở public API.
 *
 * <p>Hiệu năng: 1 query trang + 1 query ảnh IN (tránh N+1 — đường
 * listProducts(sort=discount, size=24) của home phải nhanh).</p>
 */
@Service
public class CatalogQueryService {

    private static final Set<String> VALID_SORTS =
        Set.of("price_asc", "price_desc", "rating", "newest", "discount");

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ProductImageRepository imageRepository;
    private final ProductVariantRepository variantRepository;
    private final CatalogCacheService cache;

    public CatalogQueryService(ProductRepository productRepository, CategoryRepository categoryRepository,
                               ProductImageRepository imageRepository, ProductVariantRepository variantRepository,
                               CatalogCacheService cache) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.imageRepository = imageRepository;
        this.variantRepository = variantRepository;
        this.cache = cache;
    }

    /**
     * PLP — filter category (slug vi/en, gồm cả con) + price/rating/brand/
     * official, sort, phân trang 1-based. Chỉ PUBLISHED + chưa soft-delete.
     */
    @Transactional(readOnly = true)
    public ProductCardPageDto listProducts(String categorySlug, Long minPrice, Long maxPrice, BigDecimal minRating,
                                           String brand, Boolean official, String sort, String locale,
                                           int page, int size) {
        if (page < 1) {
            throw bad("page phải >= 1 (1-based)");
        }
        if (size < 1 || size > 100) {
            throw bad("size phải trong khoảng [1, 100] (mặc định 20)");
        }
        String sortKey = (sort == null || sort.isBlank()) ? "newest" : sort.trim();
        if (!VALID_SORTS.contains(sortKey)) {
            throw bad("sort chỉ nhận: price_asc, price_desc, rating, newest, discount");
        }

        Specification<ProductEntity> spec = ProductSpecs.published();
        if (categorySlug != null && !categorySlug.isBlank()) {
            String slug = categorySlug.trim();
            UUID categoryId = categoryRepository.findBySlugViOrSlugEn(slug, slug)
                .map(CategoryEntity::getId)
                .orElse(null);
            if (categoryId == null) {
                return new ProductCardPageDto(List.of(), page, size, 0); // slug lạ → trang rỗng (filter, không 404)
            }
            spec = spec.and(ProductSpecs.inCategories(descendantIds(categoryId)));
        }
        if (minPrice != null) {
            spec = spec.and(ProductSpecs.priceAtLeast(minPrice));
        }
        if (maxPrice != null) {
            spec = spec.and(ProductSpecs.priceAtMost(maxPrice));
        }
        if (minRating != null) {
            spec = spec.and(ProductSpecs.ratingAtLeast(minRating));
        }
        if (brand != null && !brand.isBlank()) {
            spec = spec.and(ProductSpecs.brandEquals(brand.trim()));
        }
        if (official != null) {
            spec = spec.and(ProductSpecs.official(official));
        }

        Page<ProductEntity> result = productRepository.findAll(spec, PageRequest.of(page - 1, size, sortSpec(sortKey)));
        List<UUID> ids = result.map(ProductEntity::getId).getContent();
        Map<UUID, List<ProductImageEntity>> imagesByProduct = ids.isEmpty()
            ? Map.of()
            : imageRepository.findByProductIdInOrderByPositionAsc(ids).stream()
                .collect(Collectors.groupingBy(ProductImageEntity::getProductId));
        List<ProductCardDto> items = result.getContent().stream()
            .map(p -> toCard(p, imagesByProduct.getOrDefault(p.getId(), List.of()), locale))
            .toList();
        return new ProductCardPageDto(items, page, size, result.getTotalElements());
    }

    /**
     * PDP — khớp slug_vi HOẶC slug_en; draft/soft-deleted/không thấy → 404.
     *
     * <p>Cache-aside Redis (Task 7, spec Q13): resolve entity TRƯỚC rồi mới
     * cache theo canonical key {@code cat:prod:{entity.slugVi}:{locale}} —
     * 2 đường URL (slug vi/en) dùng chung 1 key mỗi locale. 404 không cache
     * (draft→publish heal ngay). {@code cat:home} không cache backend —
     * Next.js ISR (revalidate 60s) đã cache home listing; double-cache =
     * YAGNI (deviation plan Task 7, coordinator duyệt trong dispatch).</p>
     */
    @Transactional(readOnly = true)
    public ProductDetailDto getProduct(String slug, String locale) {
        ProductEntity product = productRepository.findBySlugViOrSlugEn(slug, slug)
            .filter(p -> p.getStatus() == ProductStatus.PUBLISHED && p.getDeletedAt() == null)
            .orElseThrow(() -> new NoSuchElementException("product: " + slug));
        return cache.getOrLoadDetail(product.getSlugVi(), locale, () -> {
            List<ProductImageEntity> images = imageRepository.findByProductIdOrderByPositionAsc(product.getId());
            List<ProductVariantEntity> variants = variantRepository.findByProductIdOrderByCreatedAtAsc(product.getId());
            return toDetail(product, images, variants, locale);
        });
    }

    /**
     * FI-397 demo follow-up — GET /api/catalog/products/by-id/{id}: ordering
     * re-price saga đọc giá theo id (HttpCatalogPricingClient) thay vì path
     * admin (ROLE_ADMIN — ordering không có token service → 401 → saga 502).
     * Public cùng shape ProductDetailDto (name/price/variants[].id+priceDelta).
     * Draft/deleted → 404 (khác admin view — public chỉ thấy PUBLISHED).
     */
    @Transactional(readOnly = true)
    public ProductDetailDto getProductById(java.util.UUID id, String locale) {
        ProductEntity product = productRepository.findById(id)
            .filter(p -> p.getStatus() == ProductStatus.PUBLISHED && p.getDeletedAt() == null)
            .orElseThrow(() -> new NoSuchElementException("product: " + id));
        return cache.getOrLoadDetail(product.getSlugVi(), locale, () -> {
            List<ProductImageEntity> images = imageRepository.findByProductIdOrderByPositionAsc(product.getId());
            List<ProductVariantEntity> variants = variantRepository.findByProductIdOrderByCreatedAtAsc(product.getId());
            return toDetail(product, images, variants, locale);
        });
    }

    /**
     * Cây danh mục — load 1 lần, assemble đệ quy trong memory, children sort
     * theo tên đã resolve. Cache-aside 1 key/{@code locale} TTL 1800s (Task 7)
     * — category write không emit event nên invalidate chỉ xảy ra theo TTL.
     */
    @Transactional(readOnly = true)
    public List<CategoryDto> getCategoryTree(String locale) {
        return cache.getOrLoadCategoryTree(locale, () -> {
            List<CategoryEntity> all = categoryRepository.findAll();
            Map<UUID, List<CategoryEntity>> byParent = all.stream()
                .filter(c -> c.getParentId() != null)
                .collect(Collectors.groupingBy(CategoryEntity::getParentId));
            return all.stream()
                .filter(c -> c.getParentId() == null)
                .sorted(Comparator.comparing(c -> c.getName().resolve(locale)))
                .map(root -> toCategory(root, byParent, locale))
                .toList();
        });
    }

    // ── mappers ──────────────────────────────────────────────────────────────

    /**
     * Mapper ProductCard DUY NHẤT của service — public static để search engines
     * (Task 4 PgFts / Task 6 EsEngine) hydrate cùng logic, KHÔNG nhân bản
     * (resolve locale, discountPercent, flash, image position 0...).
     */
    public static ProductCardDto toCard(ProductEntity p, List<ProductImageEntity> images, String locale) {
        String name = p.getName().resolve(locale);
        String slug = LocaleResolver.EN.equals(locale) ? p.getSlugEn() : p.getSlugVi();
        return new ProductCardDto(
            p.getId(),
            slug,
            p.getSlugEn(),
            name,
            p.getBrand(),
            p.getPrice(),
            p.getComparePrice(),
            discountPercent(p),
            p.isFlashActive() ? p.getFlashSaleEndsAt() : null, // hết hạn → không trả (card render thường)
            ratingAvg(p),
            p.getRatingCount(),
            cardImage(images, name),
            p.getTags() == null ? List.of() : List.copyOf(p.getTags()),
            p.getCategoryId());
    }

    /**
     * Mapper ProductDetail — public static để AdminCatalogService (Task 8b)
     * dựng {@code ProductAdminView = ProductDetail + i18n gốc} KHÔNG nhân bản
     * (cùng logic variant priceDelta/flash/image như PDP public).
     */
    public static ProductDetailDto toDetail(ProductEntity p, List<ProductImageEntity> images,
                                      List<ProductVariantEntity> variants, String locale) {
        ProductCardDto card = toCard(p, images, locale);
        List<ProductImageDto> imageDtos = images.stream()
            .map(i -> new ProductImageDto(i.getUrl(), i.getAlt(), i.getPosition()))
            .toList();
        List<VariantDto> variantDtos = variants.stream()
            .map(v -> toVariant(v, p, locale))
            .toList();
        return new ProductDetailDto(
            card.id(), card.slug(), card.slugEn(), card.name(), card.brand(), card.price(),
            card.comparePrice(), card.discountPercent(), card.flashSaleEndsAt(), card.ratingAvg(),
            card.ratingCount(), card.image(), card.tags(), card.categoryId(),
            p.getDescription().resolve(locale),
            p.getSeoTitle() != null ? p.getSeoTitle().resolve(locale) : null,
            p.getSeoDescription() != null ? p.getSeoDescription().resolve(locale) : null,
            imageDtos, variantDtos, 0);
    }

    /** Mapping đọc variant — spec Q5c CHÍNH XÁC. */
    private static VariantDto toVariant(ProductVariantEntity v, ProductEntity product, String locale) {
        String name = v.getNameI18n() != null ? v.getNameI18n().resolve(locale) : fallbackVariantName(v);
        Map<String, String> options = new LinkedHashMap<>();
        if (v.getColor() != null) {
            options.put("color", v.getColor());
        }
        if (v.getSize() != null) {
            options.put("size", v.getSize());
        }
        long priceDelta = v.getPrice() != null ? v.getPrice() - product.getPrice() : 0;
        return new VariantDto(v.getId(), name, options, priceDelta, 0, v.getNameI18n());
    }

    /** Fallback tên variant: non-null của [color, size] join " / " (Q5c). */
    private static String fallbackVariantName(ProductVariantEntity v) {
        return Stream.of(v.getColor(), v.getSize())
            .filter(Objects::nonNull)
            .filter(s -> !s.isBlank())
            .collect(Collectors.joining(" / "));
    }

    private CategoryDto toCategory(CategoryEntity node, Map<UUID, List<CategoryEntity>> byParent, String locale) {
        List<CategoryDto> children = byParent.getOrDefault(node.getId(), List.of()).stream()
            .sorted(Comparator.comparing(c -> c.getName().resolve(locale)))
            .map(child -> toCategory(child, byParent, locale))
            .toList();
        return new CategoryDto(
            node.getId(),
            resolvedCategorySlug(node, locale),
            node.getSlugEn(),
            node.getName().resolve(locale),
            node.getParentId(),
            children);
    }

    private static String resolvedCategorySlug(CategoryEntity node, String locale) {
        String preferred = LocaleResolver.EN.equals(locale) ? node.getSlugEn() : node.getSlugVi();
        return (preferred != null && !preferred.isBlank()) ? preferred : node.getSlugVi() != null ? node.getSlugVi() : node.getSlugEn();
    }

    private static ImageRefDto cardImage(List<ProductImageEntity> images, String name) {
        if (images == null || images.isEmpty()) {
            return new ImageRefDto("", name); // không có ảnh → url rỗng + alt = tên (plan Task 3)
        }
        ProductImageEntity first = images.get(0); // repo sort theo position — get(0) = position thấp nhất
        return new ImageRefDto(first.getUrl(), first.getAlt() != null ? first.getAlt() : name);
    }

    /** (comparePrice − price) × 100 / comparePrice, làm tròn xuống — chỉ khi compare > price, else null. */
    private static Integer discountPercent(ProductEntity p) {
        if (p.getComparePrice() == null || p.getComparePrice() <= p.getPrice()) {
            return null;
        }
        return (int) ((p.getComparePrice() - p.getPrice()) * 100 / p.getComparePrice());
    }

    private static BigDecimal ratingAvg(ProductEntity p) {
        BigDecimal raw = p.getRatingAvg() == null ? BigDecimal.ZERO : p.getRatingAvg();
        return raw.setScale(1, RoundingMode.HALF_UP); // 1 chữ số thập phân (Task 8)
    }

    /** Danh mục + toàn bộ descendants (filter parent phải thấy hàng của con). */
    private List<UUID> descendantIds(UUID rootId) {
        Map<UUID, List<CategoryEntity>> byParent = categoryRepository.findAll().stream()
            .filter(c -> c.getParentId() != null)
            .collect(Collectors.groupingBy(CategoryEntity::getParentId));
        List<UUID> ids = new ArrayList<>();
        Deque<UUID> stack = new ArrayDeque<>();
        stack.push(rootId);
        while (!stack.isEmpty()) {
            UUID current = stack.pop();
            ids.add(current);
            byParent.getOrDefault(current, List.of()).forEach(child -> stack.push(child.getId()));
        }
        return ids;
    }

    /**
     * Sort map (plan Task 3 + spec Q9): discount theo {@code @Formula discountRate}
     * (SQL Q9 verbatim); rating tiebreak ratingCount; newest createdAt DESC.
     * Mọi branch kết thúc {@code id ASC} — key bằng nhau vẫn ổn định giữa các trang.
     */
    private static Sort sortSpec(String sortKey) {
        return switch (sortKey) {
            case "price_asc" -> Sort.by(Sort.Order.asc("price"), Sort.Order.asc("id"));
            case "price_desc" -> Sort.by(Sort.Order.desc("price"), Sort.Order.asc("id"));
            case "rating" -> Sort.by(Sort.Order.desc("ratingAvg"), Sort.Order.desc("ratingCount"), Sort.Order.asc("id"));
            case "discount" -> Sort.by(Sort.Order.desc("discountRate"), Sort.Order.asc("id"));
            default -> Sort.by(Sort.Order.desc("createdAt"), Sort.Order.asc("id")); // newest + default khi không truyền sort
        };
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
