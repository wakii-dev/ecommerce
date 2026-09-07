package com.ecommerce.identity.twofa;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface TwoFactorChallengeRepository extends JpaRepository<TwoFactorChallengeEntity, UUID> {

    Optional<TwoFactorChallengeEntity> findByTokenHash(String tokenHash);

    /** Atomic consume — token dùng 1 lần (pattern revokeIfActive). */
    @Modifying
    @Query("update TwoFactorChallengeEntity c set c.consumedAt = :now " +
        "where c.tokenHash = :tokenHash and c.consumedAt is null and c.expiresAt > :now")
    int consumeIfActive(@Param("tokenHash") String tokenHash, @Param("now") Instant now);

    @Modifying
    @Query("delete from TwoFactorChallengeEntity c where c.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
