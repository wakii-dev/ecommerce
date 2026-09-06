package com.ecommerce.catalog.reviews;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ReviewEntity;
import com.ecommerce.catalog.domain.ReviewStatus;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ReviewEligibilityRepository;
import com.ecommerce.catalog.repo.ReviewRepository;
import com.ecommerce.catalog.reviews.web.dto.ReviewDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewListDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewSubmitRequest;

/**
 * Review service (SF-8) — submit (202, policy 1 review/user/product) + public
 * list (CHỈ APPROVED + breakdown fill-0, spec Q5). Giải nghĩa quyết định:
 *
 * <ul>
 *   <li><strong>202 no-body</strong> — contract {@code '202': Đã nhận — chờ
 *       duyệt} không định nghĩa schema body; FE toast là client-side text
 *       (spec-critic P0).</li>
 *   <li><strong>Duplicate → 409</strong> — UNIQUE(user_id, product_id) V11;
 *       service check trước để trả 409 êm, bắt
 *       {@code DataIntegrityViolationException} làm lớp chống-race (2 submit
 *       đồng thời — GlobalExceptionHandler tự map 409 nhưng detail chung nên
 *       vẫn ném riêng khi bắt được).</li>
 *   <li><strong>verified lúc submit</strong> — EXISTS review_eligibility; event
 *       đến SAU submit không hồi-đức review cũ (badge đánh ở thời điểm viết —
 *       spec Q4).</li>
 * </ul>
 */
@Service
public class ReviewService {

    private final ProductRepository productRepository;
    private final ReviewRepository reviewRepository;
    private final ReviewEligibilityRepository eligibilityRepository;

    public ReviewService(ProductRepository productRepository, ReviewRepository reviewRepository,
                         ReviewEligibilityRepository eligibilityRepository) {
        this.productRepository = productRepository;
        this.reviewRepository = reviewRepository;
        this.eligibilityRepository = eligibilityRepository;
    }

    /** Submit review — 202 no-body; status luôn PENDING. */
    @Transactional
    public void submit(String slug, ReviewSubmitRequest request, UUID userId, String userName) {
        ProductEntity product = publishedProduct(slug);
        validate(request);

        if (reviewRepository.existsByUserIdAndProductId(userId, product.getId())) {
            throw conflict("Bạn đã đánh giá sản phẩm này rồi — có thể sửa review đang chờ duyệt");
        }
        boolean verified = eligibilityRepository.existsByUserIdAndProductId(userId, product.getId());

        ReviewEntity review = new ReviewEntity();
        review.setProductId(product.getId());
        review.setUserId(userId);
        review.setUserName(userName);
        review.setRating(request.rating());
        review.setTitle(normalizeTitle(request.title()));
        review.setContent(request.content().trim());
        review.setStatus(ReviewStatus.PENDING);
        review.setVerified(verified);
        try {
            reviewRepository.saveAndFlush(review);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // race: 2 submit đồng thời vượt exists-check — UNIQUE chặn ở DB
            throw conflict("Bạn đã đánh giá sản phẩm này rồi — có thể sửa review đang chờ duyệt");
        }
    }

    /** Public list — CHỈ APPROVED, mới nhất trước; breakdown "5".."1" luôn đủ key. */
    @Transactional(readOnly = true)
    public ReviewListDto list(String slug, int page, int size) {
        ProductEntity product = publishedProduct(slug);
        if (page < 1) {
            throw bad("page phải >= 1 (1-based)");
        }
        if (size < 1 || size > 100) {
            throw bad("size phải trong khoảng [1, 100] (mặc định 20)");
        }
        Pageable pageable = PageRequest.of(page - 1, size);
        Page<ReviewEntity> result =
            reviewRepository.findByProductIdAndStatusOrderByCreatedAtDesc(product.getId(), ReviewStatus.APPROVED, pageable);

        Map<String, Long> breakdown = new LinkedHashMap<>();
        for (int star = 5; star >= 1; star--) {
            breakdown.put(String.valueOf(star), 0L);
        }
        for (ReviewRepository.RatingCount row : reviewRepository.countByProductGroupByRating(product.getId())) {
            if (row.getRating() >= 1 && row.getRating() <= 5) {
                breakdown.put(String.valueOf(row.getRating()), row.getTotal());
            }
        }

        return new ReviewListDto(
            result.getContent().stream().map(ReviewService::toDto).toList(),
            breakdown,
            result.getTotalElements());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /** Product theo slug vi/en — phải PUBLISHED + chưa soft-delete, else 404 (spec Q4). */
    private ProductEntity publishedProduct(String slug) {
        ProductEntity product = productRepository.findBySlugViOrSlugEn(slug, slug).orElseThrow(
            () -> notFound("Không tìm thấy sản phẩm"));
        if (product.getStatus() != ProductStatus.PUBLISHED || product.getDeletedAt() != null) {
            throw notFound("Không tìm thấy sản phẩm");
        }
        return product;
    }

    private static void validate(ReviewSubmitRequest request) {
        if (request.rating() == null || request.rating() < 1 || request.rating() > 5) {
            throw bad("rating phải trong khoảng 1..5");
        }
        if (request.content() == null || request.content().isBlank()) {
            throw bad("content bắt buộc (non-blank)");
        }
        if (request.title() != null && request.title().trim().length() > 255) {
            throw bad("title tối đa 255 ký tự");
        }
    }

    private static String normalizeTitle(String title) {
        if (title == null) {
            return null;
        }
        String trimmed = title.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public static ReviewDto toDto(ReviewEntity review) {
        return new ReviewDto(
            review.getId(),
            review.getUserId(),
            review.getUserName(),
            review.getRating(),
            review.getTitle(),
            review.getContent(),
            review.isVerified(),
            review.getCreatedAt() == null ? OffsetDateTime.now().toInstant() : review.getCreatedAt());
    }

    /** Error factories dùng chung slice reviews (controller package khác cần — public). */
    public static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    public static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
