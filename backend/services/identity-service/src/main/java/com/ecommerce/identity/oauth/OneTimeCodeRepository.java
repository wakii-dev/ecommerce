package com.ecommerce.identity.oauth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface OneTimeCodeRepository extends JpaRepository<OneTimeCodeEntity, UUID> {

    Optional<OneTimeCodeEntity> findByCodeHash(String codeHash);

    /** Atomic consume — 2 request cùng code chỉ 1 thắng (pattern revokeIfActive). */
    @Modifying
    @Query("update OneTimeCodeEntity c set c.consumedAt = :now " +
        "where c.codeHash = :codeHash and c.consumedAt is null and c.expiresAt > :now")
    int consumeIfActive(@Param("codeHash") String codeHash, @Param("now") Instant now);

    @Modifying
    @Query("delete from OneTimeCodeEntity c where c.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
