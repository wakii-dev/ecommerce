package com.ecommerce.catalog.reviews;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.repo.ReviewRepository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

/**
 * Rating aggregate denormalized (SF-8, spec Q6) — sau moderation transition,
 * recompute {@code products.rating_avg} (NUMERIC(2,1)) + {@code rating_count}
 * trên CHỈ review APPROVED, trong CÙNG tx moderation.
 *
 * <p>Pessimistic lock product row (2 admin approve product cùng lúc → recompute
 * tuần tự, không mất cập nhật) qua {@code em.find(..., PESSIMISTIC_WRITE)} —
 * không thêm method vào {@code ProductRepository} (file SF-4, file-slice).
 * Entity managed trong tx → dirty-checking flush 2 cột lúc commit.</p>
 *
 * <p>Reject cũng recompute (idempotent — rejected chưa bao giờ được tính,
 * spec Q6/pack "khi APPROVED/REJECTED → update"). KHÔNG backfill rating seed
 * SF-4: moderation là nguồn sự thật mới (spec Q20).</p>
 */
@Service
public class RatingAggregateService {

    private final ReviewRepository reviewRepository;
    private final EntityManager entityManager;

    public RatingAggregateService(ReviewRepository reviewRepository, EntityManager entityManager) {
        this.reviewRepository = reviewRepository;
        this.entityManager = entityManager;
    }

    /**
     * Gọi trong tx moderation (REQUIRED — tham gia tx có sẵn, không tự mở).
     * Lock product row → recompute avg 1 chữ số (HALF_UP: {5,4,4} → 4.3).
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public void recompute(UUID productId) {
        ProductEntity product = entityManager.find(ProductEntity.class, productId, LockModeType.PESSIMISTIC_WRITE);
        if (product == null) {
            // FK đảm bảo product tồn tại; defensive — không crash moderation
            return;
        }
        ReviewRepository.Aggregate aggregate = reviewRepository.aggregateApproved(productId);
        product.setRatingAvg(BigDecimal.valueOf(aggregate.getAvg()).setScale(1, RoundingMode.HALF_UP));
        product.setRatingCount((int) aggregate.getTotal());
    }
}
