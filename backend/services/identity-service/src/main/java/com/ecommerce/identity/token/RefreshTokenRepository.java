package com.ecommerce.identity.token;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, UUID> {
    Optional<RefreshTokenEntity> findByTokenHash(String tokenHash);
}
