package com.ecommerce.identity.token;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, UUID> {
    Optional<RefreshTokenEntity> findByTokenHash(String tokenHash);

    /**
     * Revoke ATOMIC (chống race rotation): UPDATE có điều kiện
     * {@code revoked_at IS NULL} — 2 request refresh cùng token chỉ có 1 thắng
     * (DB row lock + re-check WHERE), thua race nhận 0 → caller trả 401.
     *
     * @return số row update: 1 = revoke thành công, 0 = đã revoked/thua race
     */
    @Modifying
    @Query("update RefreshTokenEntity t set t.revokedAt = :now where t.tokenHash = :hash and t.revokedAt is null")
    int revokeIfActive(@Param("hash") String hash, @Param("now") Instant now);
}
