package com.ecommerce.identity.newsletter;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface NewsletterRepository extends JpaRepository<NewsletterSubscriptionEntity, UUID> {
    Optional<NewsletterSubscriptionEntity> findByEmail(String email);

    Page<NewsletterSubscriptionEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
