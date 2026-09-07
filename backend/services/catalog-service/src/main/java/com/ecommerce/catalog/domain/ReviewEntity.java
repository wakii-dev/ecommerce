package com.ecommerce.catalog.domain;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Review — khớp V11 {@code reviews} (SF-8, FI-318). UGC không i18n (D17);
 * {@code userName} là snapshot claim fullName lúc submit (không join identity —
 * verified-purchase và review đều fat-denormalized theo §6.1).
 *
 * <p>Policy 1 review/user/product enforce DB-level
 * {@code uq_reviews_user_product} — submit trùng → service map violation 409
 * (race-safe: 2 submit đồng thời vượt exists-check vẫn bị DB chặn).</p>
 */
@Entity
@Table(name = "reviews")
public class ReviewEntity {

    @Id
    @UuidGenerator
    @GeneratedValue
    private UUID id;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "user_name", nullable = false)
    private String userName;

    @Column(nullable = false)
    private int rating;

    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReviewStatus status = ReviewStatus.PENDING;

    /** Badge "Mua đã xác nhận" — set lúc submit từ review_eligibility (spec Q4). */
    @Column(nullable = false)
    private boolean verified = false;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }

    public UUID getProductId() { return productId; }
    public void setProductId(UUID productId) { this.productId = productId; }

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public int getRating() { return rating; }
    public void setRating(int rating) { this.rating = rating; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public ReviewStatus getStatus() { return status; }
    public void setStatus(ReviewStatus status) { this.status = status; }

    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }

    public Instant getCreatedAt() { return createdAt; }
}
