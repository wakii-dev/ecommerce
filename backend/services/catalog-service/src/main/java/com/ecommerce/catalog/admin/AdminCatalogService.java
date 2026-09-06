package com.ecommerce.catalog.admin;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ProductVariantEntity;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ProductVariantRepository;
import com.ecommerce.catalog.service.CatalogQueryService;
import com.ecommerce.catalog.web.dto.CategoryAdminDto;
import com.ecommerce.catalog.web.dto.CategoryWriteDto;
import com.ecommerce.catalog.web.dto.ProductAdminItemDto;
import com.ecommerce.catalog.web.dto.ProductAdminItemPageDto;
import com.ecommerce.catalog.web.dto.ProductAdminViewDto;
import com.ecommerce.catalog.web.dto.ProductCardDto;
import com.ecommerce.catalog.web.dto.ProductDetailDto;
import com.ecommerce.catalog.web.dto.ProductWriteDto;
import com.ecommerce.common.outbox.OutboxWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Admin CRUD product/category (Task 8b) — path contract §admin, mọi write
 * CÙNG tx với outbox {@code product.changed} (transactional outbox).
 *
 * <p><strong>Quyết định event:</strong> CHỈ product write mới emit
 * {@code product.changed} — payload contract bắt buộc productId nên category
 * không đủ hợp lệ để emit (giữ contract-pure, không bóp méo schema); cache cây
 * category dùng TTL 1800s nên staleness chấp nhận được ở SF-4 — consumer riêng
 * cho category sẽ thêm khi cache task cần.</p>
 *
 * <p>Soft-delete product: {@code deleted_at = now()} — public query đã lọc
 * {@code IS NULL}; admin không có "thùng rác" ở SF-4 nên mọi endpoint admin
 * cũng bỏ qua hàng đã xóa (404).</p>
 */
@Service
public class AdminCatalogService {

    /** Routing key trên topic exchange — theo contracts/events/product.changed.schema.json. */
    static final String EVENT_TYPE = "product.changed";

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ProductImageRepository imageRepository;
    private final ProductVariantRepository variantRepository;
    private final OutboxWriter outbox;
    private final ObjectMapper objectMapper;

    public AdminCatalogService(ProductRepository productRepository, CategoryRepository categoryRepository,
                               ProductImageRepository imageRepository, ProductVariantRepository variantRepository,
                               OutboxWriter outbox, ObjectMapper objectMapper) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.imageRepository = imageRepository;
        this.variantRepository = variantRepository;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
    }

    // ── product ─────────────────────────────────────────────────────────────

    /** List admin — q (name vi/en + slug vi/en contains) + status filter + page 1-based. */
    @Transactional(readOnly = true)
    public ProductAdminItemPageDto listProducts(String q, String status, int page, int size) {
        if (page < 1) {
            throw bad("page phải >= 1 (1-based)");
        }
        if (size < 1 || size > 100) {
            throw bad("size phải trong khoảng [1, 100] (mặc định 20)");
        }
        ProductStatus statusFilter = parseStatus(status);
        // Admin không có thùng rác SF-4 → luôn bỏ hàng soft-delete
        Specification<ProductEntity> spec = (root, query, cb) -> cb.isNull(root.get("deletedAt"));
        if (q != null && !q.isBlank()) {
            spec = spec.and(qContains(q.trim().toLowerCase()));
        }
        if (statusFilter != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("status"), statusFilter));
        }
        Page<ProductEntity> result = productRepository.findAll(spec,
            PageRequest.of(page - 1, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.asc("id"))));
        List<UUID> ids = result.map(ProductEntity::getId).getContent();
        Map<UUID, List<ProductImageEntity>> imagesByProduct = ids.isEmpty()
            ? Map.of()
            : imageRepository.findByProductIdInOrderByPositionAsc(ids).stream()
                .collect(Collectors.groupingBy(ProductImageEntity::getProductId));
        List<ProductAdminItemDto> items = result.getContent().stream()
            .map(p -> toAdminItem(p, imagesByProduct.getOrDefault(p.getId(), List.of())))
            .toList();
        return new ProductAdminItemPageDto(items, page, size, result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public ProductAdminViewDto getProduct(UUID id) {
        return toAdminView(findActive(id));
    }

    @Transactional
    public ProductAdminViewDto createProduct(ProductWriteDto dto, String correlationId) {
        validate(dto);
        requireCategory(dto.categoryId());
        ProductEntity product = new ProductEntity();
        applyWrite(product, dto);
        product.setStatus(dto.status() == null ? ProductStatus.DRAFT : dto.status());
        productRepository.saveAndFlush(product); // flush → unique slug violation ngay tại đây (409)
        replaceImages(product.getId(), dto.images());
        replaceVariants(product, dto.variants());
        emitProductEvent(product, "CREATED", correlationId);
        return toAdminView(product);
    }

    /** PUT thay thế trọn vẹn (contract) — publish/unpublish = PUT {@code status} DRAFT↔PUBLISHED. */
    @Transactional
    public ProductAdminViewDto updateProduct(UUID id, ProductWriteDto dto, String correlationId) {
        ProductEntity product = findActive(id);
        validate(dto);
        requireCategory(dto.categoryId());
        applyWrite(product, dto);
        if (dto.status() != null) { // PUT thiếu status → giữ nguyên (không tự unpublish)
            product.setStatus(dto.status());
        }
        replaceImages(product.getId(), dto.images());
        replaceVariants(product, dto.variants()); // giá variant lưu tuyệt đối → tính lại theo price MỚI
        emitProductEvent(product, "UPDATED", correlationId);
        return toAdminView(product);
    }

    /** Soft-delete — giữ row (order/review cũ tham chiếu), event DELETED cho indexer/cache. */
    @Transactional
    public void deleteProduct(UUID id, String correlationId) {
        ProductEntity product = findActive(id);
        product.setDeletedAt(Instant.now());
        emitProductEvent(product, "DELETED", correlationId);
    }

    // ── category ────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CategoryAdminDto> listCategoryTree() {
        List<CategoryEntity> all = categoryRepository.findAll();
        Map<UUID, List<CategoryEntity>> byParent = byParent(all);
        return all.stream()
            .filter(c -> c.getParentId() == null)
            .sorted(Comparator.comparing(c -> c.getName().resolve("vi")))
            .map(root -> toAdminCategory(root, byParent))
            .toList();
    }

    @Transactional(readOnly = true)
    public CategoryAdminDto getCategory(UUID id) {
        CategoryEntity node = categoryRepository.findById(id).orElseThrow(NoSuchElementException::new);
        return toAdminCategory(node, byParent(categoryRepository.findAll()));
    }

    @Transactional
    public CategoryAdminDto createCategory(CategoryWriteDto dto) {
        validate(dto);
        UUID parentId = requireParent(dto.parentId());
        CategoryEntity category = new CategoryEntity();
        applyWrite(category, dto, parentId);
        categoryRepository.saveAndFlush(category); // flush → unique slug violation ngay tại đây (409)
        return toAdminCategory(category, Map.of());
    }

    @Transactional
    public CategoryAdminDto updateCategory(UUID id, CategoryWriteDto dto) {
        CategoryEntity category = categoryRepository.findById(id).orElseThrow(NoSuchElementException::new);
        validate(dto);
        UUID parentId = requireParent(dto.parentId());
        if (parentId != null) {
            if (parentId.equals(id)) {
                throw bad("parentId không được trùng chính danh mục");
            }
            if (isDescendant(id, parentId)) {
                throw bad("parentId không được là con/cháu của chính danh mục (cycle)");
            }
        }
        applyWrite(category, dto, parentId);
        return toAdminCategory(category, byParent(categoryRepository.findAll()));
    }

    /** 409 khi còn product LIVE hoặc còn node con; soft-deleted product được detach FK rồi mới hard-delete danh mục. */
    @Transactional
    public void deleteCategory(UUID id) {
        CategoryEntity category = categoryRepository.findById(id).orElseThrow(NoSuchElementException::new);
        if (productRepository.existsByCategoryIdAndDeletedAtIsNull(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Danh mục còn sản phẩm — di chuyển/xóa sản phẩm trước");
        }
        if (categoryRepository.existsByParentId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Danh mục còn danh mục con — xóa con trước");
        }
        // FK products.category_id: row soft-delete vẫn tham chiếu → gỡ liên kết
        // (set NULL) trong cùng tx, nếu không hard-delete danh mục văng constraint.
        productRepository.detachSoftDeletedFromCategory(id);
        categoryRepository.delete(category);
    }

    // ── validation ──────────────────────────────────────────────────────────

    /** Q5b: vi bắt buộc non-blank; en optional (vắng key hoặc blank = missing). */
    private static void validate(ProductWriteDto dto) {
        if (dto.nameI18n() == null || isBlank(dto.nameI18n().vi())) {
            throw bad("nameI18n.vi bắt buộc (non-blank); en optional (Q5b)");
        }
        if (dto.descriptionI18n() == null || isBlank(dto.descriptionI18n().vi())) {
            throw bad("descriptionI18n.vi bắt buộc (non-blank); en optional (Q5b)");
        }
        if (isBlank(dto.slugVi()) || isBlank(dto.slugEn())) {
            throw bad("slugVi và slugEn bắt buộc (non-blank)");
        }
        if (dto.price() == null || dto.price() < 0) {
            throw bad("price bắt buộc và phải >= 0 (VND integer)");
        }
    }

    private static void validate(CategoryWriteDto dto) {
        if (dto.nameI18n() == null || isBlank(dto.nameI18n().vi())) {
            throw bad("nameI18n.vi bắt buộc (non-blank); en optional (Q5b)");
        }
        if (isBlank(dto.slugVi()) || isBlank(dto.slugEn())) {
            throw bad("slugVi và slugEn bắt buộc (non-blank)");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private void requireCategory(UUID categoryId) {
        if (categoryId == null) {
            throw bad("categoryId bắt buộc");
        }
        if (!categoryRepository.existsById(categoryId)) {
            throw bad("categoryId không tồn tại: " + categoryId);
        }
    }

    /** ParentId truyền vào phải tồn tại (null = gốc). */
    private UUID requireParent(UUID parentId) {
        if (parentId == null) {
            return null;
        }
        if (!categoryRepository.existsById(parentId)) {
            throw bad("parentId không tồn tại: " + parentId);
        }
        return parentId;
    }

    /** parentId nằm trong cây con của id? (chặn cycle A→B→A khi update — list assemble đệ quy sẽ lặp vô hạn). */
    private boolean isDescendant(UUID id, UUID candidate) {
        Map<UUID, CategoryEntity> byId = categoryRepository.findAll().stream()
            .collect(Collectors.toMap(CategoryEntity::getId, c -> c));
        UUID current = candidate;
        while (current != null) {
            if (current.equals(id)) {
                return true;
            }
            CategoryEntity node = byId.get(current);
            current = node != null ? node.getParentId() : null;
        }
        return false;
    }

    // ── write mapping ───────────────────────────────────────────────────────

    private static void applyWrite(ProductEntity product, ProductWriteDto dto) {
        product.setName(dto.nameI18n());
        product.setDescription(dto.descriptionI18n());
        product.setSeoTitle(dto.seoTitleI18n());
        product.setSeoDescription(dto.seoDescriptionI18n());
        product.setSlugVi(dto.slugVi().trim());
        product.setSlugEn(dto.slugEn().trim());
        product.setBrand(dto.brand());
        product.setPrice(dto.price());
        product.setComparePrice(dto.comparePrice());
        product.setFlashSaleEndsAt(dto.flashSaleEndsAt());
        product.setTags(dto.tags() == null ? new ArrayList<>() : new ArrayList<>(dto.tags()));
        product.setCategoryId(dto.categoryId());
    }

    private static void applyWrite(CategoryEntity category, CategoryWriteDto dto, UUID parentId) {
        category.setName(dto.nameI18n());
        category.setSlugVi(dto.slugVi().trim());
        category.setSlugEn(dto.slugEn().trim());
        category.setParentId(parentId);
    }

    /** Images replace-all — position null → thứ tự trong mảng (contract position required nhưng lenient). */
    private void replaceImages(UUID productId, List<ProductWriteDto.ProductImageWrite> images) {
        imageRepository.deleteByProductId(productId);
        if (images == null) {
            return;
        }
        int index = 0;
        for (ProductWriteDto.ProductImageWrite image : images) {
            if (image == null || isBlank(image.url())) {
                throw bad("images[].url bắt buộc (non-blank)");
            }
            ProductImageEntity entity = new ProductImageEntity();
            entity.setProductId(productId);
            entity.setUrl(image.url());
            entity.setAlt(image.alt());
            entity.setPosition(image.position() != null ? image.position() : index);
            imageRepository.save(entity);
            index++;
        }
    }

    /**
     * Variants replace-all — mapping Q5c CHÍNH XÁC: {@code nameI18n → name_i18n},
     * {@code options.color/size} → cột, {@code priceDelta != null} →
     * {@code price = product.price + priceDelta} (lưu TUYỆT ĐỐI — đổi price gốc
     * phải PUT lại variants để delta không lệch), {@code stock} accept-and-IGNORE
     * (SF-5), {@code sku_code} seed-only nên write luôn null.
     */
    private void replaceVariants(ProductEntity product, List<ProductWriteDto.VariantWrite> variants) {
        variantRepository.deleteByProductId(product.getId());
        if (variants == null) {
            return;
        }
        for (ProductWriteDto.VariantWrite variant : variants) {
            if (variant == null) {
                continue;
            }
            ProductVariantEntity entity = new ProductVariantEntity();
            entity.setProductId(product.getId());
            entity.setNameI18n(variant.nameI18n());
            Map<String, String> options = variant.options() == null ? Map.of() : variant.options();
            entity.setColor(options.get("color"));
            entity.setSize(options.get("size"));
            entity.setPrice(variant.priceDelta() != null ? product.getPrice() + variant.priceDelta() : null);
            variantRepository.save(entity);
        }
    }

    // ── read mapping (tái dùng mapper public của CatalogQueryService) ───────

    private static ProductAdminItemDto toAdminItem(ProductEntity p, List<ProductImageEntity> images) {
        ProductCardDto card = CatalogQueryService.toCard(p, images, "vi");
        return new ProductAdminItemDto(card.id(), card.slug(), card.slugEn(), card.name(), card.brand(),
            card.price(), card.comparePrice(), card.discountPercent(), card.flashSaleEndsAt(),
            card.ratingAvg(), card.ratingCount(), card.image(), card.tags(), card.categoryId(),
            p.getStatus().name(), p.getSlugVi());
    }

    private ProductAdminViewDto toAdminView(ProductEntity p) {
        ProductDetailDto detail = CatalogQueryService.toDetail(p,
            imageRepository.findByProductIdOrderByPositionAsc(p.getId()),
            variantRepository.findByProductIdOrderByCreatedAtAsc(p.getId()), "vi");
        return new ProductAdminViewDto(detail.id(), detail.slug(), detail.slugEn(), detail.name(), detail.brand(),
            detail.price(), detail.comparePrice(), detail.discountPercent(), detail.flashSaleEndsAt(),
            detail.ratingAvg(), detail.ratingCount(), detail.image(), detail.tags(), detail.categoryId(),
            detail.description(), detail.images(), detail.variants(), detail.relatedCount(),
            p.getStatus().name(), p.getName(), p.getDescription(), p.getSeoTitle(), p.getSeoDescription(),
            p.getSlugVi());
    }

    private CategoryAdminDto toAdminCategory(CategoryEntity node, Map<UUID, List<CategoryEntity>> byParent) {
        List<CategoryAdminDto> children = byParent.getOrDefault(node.getId(), List.of()).stream()
            .sorted(Comparator.comparing(c -> c.getName().resolve("vi")))
            .map(child -> toAdminCategory(child, byParent))
            .toList();
        return new CategoryAdminDto(node.getId(), node.getSlugVi(), node.getSlugEn(),
            node.getName().resolve("vi"), node.getParentId(), children, node.getName(), node.getSlugVi());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static Map<UUID, List<CategoryEntity>> byParent(List<CategoryEntity> all) {
        return all.stream()
            .filter(c -> c.getParentId() != null)
            .collect(Collectors.groupingBy(CategoryEntity::getParentId));
    }

    /** findActive — admin bỏ hàng soft-delete (không thùng rác SF-4). */
    private ProductEntity findActive(UUID id) {
        return productRepository.findById(id)
            .filter(p -> p.getDeletedAt() == null)
            .orElseThrow(NoSuchElementException::new);
    }

    private static ProductStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return ProductStatus.valueOf(status.trim());
        } catch (IllegalArgumentException e) {
            throw bad("status chỉ nhận: DRAFT, PUBLISHED");
        }
    }

    /** q khớp name vi/en (jsonb extract) + slug vi/en — contains, không phân biệt hoa thường. */
    private static Specification<ProductEntity> qContains(String q) {
        String like = "%" + q + "%";
        return (root, query, cb) -> cb.or(
            cb.like(cb.lower(cb.function("jsonb_extract_path_text", String.class,
                root.get("name"), cb.literal("vi"))), like),
            cb.like(cb.lower(cb.function("jsonb_extract_path_text", String.class,
                root.get("name"), cb.literal("en"))), like),
            cb.like(cb.lower(root.get("slugVi")), like),
            cb.like(cb.lower(root.get("slugEn")), like));
    }

    /**
     * Outbox CÙNG tx (OutboxWriter MANDATORY) — payload theo
     * contracts/events/product.changed.schema.json, correlationId = X-Request-Id.
     */
    private void emitProductEvent(ProductEntity product, String action, String correlationId) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("productId", product.getId().toString());
        payload.put("action", action);
        payload.put("slugVi", product.getSlugVi());
        payload.put("slugEn", product.getSlugEn());
        payload.put("changedAt", Instant.now().toString());
        outbox.write(EVENT_TYPE, payload, correlationId);
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
