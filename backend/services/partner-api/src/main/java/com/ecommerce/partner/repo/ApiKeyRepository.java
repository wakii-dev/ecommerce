package com.ecommerce.partner.repo;

import com.ecommerce.partner.domain.ApiKeyEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ApiKeyRepository extends JpaRepository<ApiKeyEntity, UUID> {

    /** Candidates theo prefix — so tiếp sha256 bằng MessageDigest.isEqual (constant-time). */
    List<ApiKeyEntity> findByPrefix(String prefix);
}
