package com.ecommerce.catalog.wishlist;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.WishlistItemEntity;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.WishlistItemRepository;
import com.ecommerce.catalog.service.CatalogQueryService;
import com.ecommerce.catalog.web.dto.ProductCardDto;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.wishlist.web.dto.WishlistIdsDto;

/**
 * Wishlist service (SF-8, spec Q11) — page enrich (reuse
 * {@link CatalogQueryService#toCard} + LocaleResolver phía controller — KHÔNG
 * copy logic resolve SF-4), ids cho heart state, PUT idempotent 204, DELETE
 * LUÔN 204 (contract — kể cả product hard-delete, spec Q11/plan-critic).
 *
 * <p>Page chỉ hiện product PUBLISHED + chưa soft-delete: product bị ẩn/xóa sau
 * khi user heart → tự biến mất khỏi trang wishlist (ids vẫn trả nguyên —
 * heart state là dữ liệu user, không phụ thuộc product visibility).</p>
 */
@Service
public class WishlistService {

    private final WishlistItemRepository wishlistRepository;
    private final ProductRepository productRepository;
    private final ProductImageRepository imageRepository;

    public WishlistService(WishlistItemRepository wishlistRepository, ProductRepository productRepository,
                           ProductImageRepository imageRepository) {
        this.wishlistRepository = wishlistRepository;
        this.productRepository = productRepository;
        this.imageRepository = imageRepository;
    }

    @Transactional(readOnly = true)
    public ProductCardPageDto wishlistPage(UUID userId, String locale, int page, int size) {
        validatePage(page, size);
        Page<WishlistItemEntity> items =
            wishlistRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page - 1, size));
        List<UUID> orderedIds = items.getContent().stream().map(WishlistItemEntity::getProductId).toList();
        if (orderedIds.isEmpty()) {
            return new ProductCardPageDto(List.of(), page, size, 0);
        }

        Map<UUID, ProductEntity> products = productRepository.findAllById(orderedIds).stream()
            .filter(p -> p.getStatus() == ProductStatus.PUBLISHED && p.getDeletedAt() == null)
            .collect(Collectors.toMap(ProductEntity::getId, Function.identity()));
        Map<UUID, List<ProductImageEntity>> imagesByProduct = imageRepository
            .findByProductIdInOrderByPositionAsc(orderedIds).stream()
            .collect(Collectors.groupingBy(ProductImageEntity::getProductId));

        // Giữ thứ tự wishlist (mới thêm trước) — findAllById không bảo toàn thứ tự
        List<ProductCardDto> cards = orderedIds.stream()
            .map(products::get)
            .filter(p -> p != null)
            .map(p -> CatalogQueryService.toCard(p, imagesByProduct.getOrDefault(p.getId(), List.of()), locale))
            .toList();
        return new ProductCardPageDto(cards, page, size, items.getTotalElements());
    }

    @Transactional(readOnly = true)
    public WishlistIdsDto wishlistIds(UUID userId) {
        return new WishlistIdsDto(wishlistRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .map(WishlistItemEntity::getProductId)
            .toList());
    }

    /** Idempotent add — product phải PUBLISHED tồn tại else 404 (contract). */
    @Transactional
    public void add(UUID userId, UUID productId) {
        ProductEntity product = productRepository.findById(productId).orElseThrow(
            () -> notFound("Không tìm thấy sản phẩm"));
        if (product.getStatus() != ProductStatus.PUBLISHED || product.getDeletedAt() != null) {
            throw notFound("Không tìm thấy sản phẩm");
        }
        wishlistRepository.insertIgnore(userId, product.getId());
    }

    /** Remove — 204 LUÔN: không có row / product hard-delete vẫn 204 (idempotent). */
    @Transactional
    public void remove(UUID userId, UUID productId) {
        wishlistRepository.deletePair(userId, productId);
    }

    private static void validatePage(int page, int size) {
        if (page < 1) {
            throw bad("page phải >= 1 (1-based)");
        }
        if (size < 1 || size > 100) {
            throw bad("size phải trong khoảng [1, 100] (mặc định 20)");
        }
    }

    public static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
