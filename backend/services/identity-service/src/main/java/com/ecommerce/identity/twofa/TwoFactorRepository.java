package com.ecommerce.identity.twofa;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TwoFactorRepository extends JpaRepository<TwoFactorEntity, UUID> {

    Optional<TwoFactorEntity> findByUserId(UUID userId);

    boolean existsByUserIdAndEnabledTrue(UUID userId);
}
