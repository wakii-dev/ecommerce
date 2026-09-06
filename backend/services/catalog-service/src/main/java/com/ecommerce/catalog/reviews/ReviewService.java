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
import com.ecommerce.catalog.reviews.web.dto.ReviewAdminDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewAdminPageDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewListDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewSubmitRequest;
import com.ecommerce.common.outbox.OutboxWriter;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    private final OutboxWriter outboxWriter;
    private final ObjectMapper objectMapper;
    private final RatingAggregateService ratingAggregateService;

    public ReviewService(ProductRepository productRepository, ReviewRepository reviewRepository,
                         ReviewEligibilityRepository eligibilityRepository, OutboxWriter outboxWriter,
                         ObjectMapper objectMapper, RatingAggregateService ratingAggregateService) {
        this.productRepository = productRepository;
        this.reviewRepository = reviewRepository;
        this.eligibilityRepository = eligibilityRepository;
        this.outboxWriter = outboxWriter;
        this.objectMapper = objectMapper;
        this.ratingAggregateService = ratingAggregateService;
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

    // ── admin moderation (T3) ───────────────────────────────────────────────

    /**
     * Admin moderation queue — filter status (default PENDING), mới nhất trước
     * (contract GET /admin/reviews).
     */
    @Transactional(readOnly = true)
    public ReviewAdminPageDto adminList(String status, int page, int size) {
        ReviewStatus statusFilter = parseStatus(status);
        if (page < 1) {
            throw bad("page phải >= 1 (1-based)");
        }
        if (size < 1 || size > 100) {
            throw bad("size phải trong khoảng [1, 100] (mặc định 20)");
        }
        Page<ReviewEntity> result = statusFilter == null
            ? reviewRepository.findAll(PageRequest.of(page - 1, size))
            : reviewRepository.findByStatusOrderByCreatedAtDesc(statusFilter, PageRequest.of(page - 1, size));
        return new ReviewAdminPageDto(
            result.getContent().stream().map(ReviewService::toAdminDto).toList(),
            page, size, result.getTotalElements());
    }

    /**
     * Approve/reject (contract POST /admin/reviews/{id}/approve|reject) — 1 tx:
     * transition + outbox {@code review.moderated} + recompute aggregate
     * (pessimistic lock product — RatingAggregateService). Chỉ PENDING được
     * transition, trạng thái khác → 409 (spec Q7). Payload khít
     * contracts/events/review.moderated.schema.json.
     */
    @Transactional
    public ReviewAdminDto moderate(UUID reviewId, boolean approve, String correlationId) {
        ReviewEntity review = reviewRepository.findById(reviewId).orElseThrow(
            () -> notFound("Không tìm thấy review"));
        ReviewStatus target = approve ? ReviewStatus.APPROVED : ReviewStatus.REJECTED;
        if (review.getStatus() != ReviewStatus.PENDING) {
            throw conflict("Review đã ở trạng thái " + review.getStatus() + " — chỉ PENDING được duyệt/từ chối");
        }
        review.setStatus(target);

        java.time.Instant moderatedAt = java.time.Instant.now();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("reviewId", review.getId().toString());
        payload.put("productId", review.getProductId().toString());
        payload.put("userId", review.getUserId().toString());
        payload.put("status", target.name());
        payload.put("rating", review.getRating());
        payload.put("moderatedAt", moderatedAt.toString());
        outboxWriter.write("review.moderated", objectMapper.valueToTree(payload), correlationId);

        ratingAggregateService.recompute(review.getProductId());
        return toAdminDto(review);
    }

    private static ReviewStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null; // default PENDING xử lý ở controller? — contract: default PENDING
        }
        try {
            return ReviewStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw bad("status phải là PENDING|APPROVED|REJECTED");
        }
    }

    public static ReviewAdminDto toAdminDto(ReviewEntity review) {
        return new ReviewAdminDto(
            review.getId(),
            review.getUserId(),
            review.getUserName(),
            review.getRating(),
            review.getTitle(),
            review.getContent(),
            review.isVerified(),
            review.getCreatedAt(),
            review.getProductId(),
            review.getStatus().name());
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
