package com.ecommerce.affiliate.repo;

import com.ecommerce.affiliate.domain.Click;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.UUID;

public interface ClickRepository extends JpaRepository<Click, UUID> {

    /** Đếm click của 1 code từ 1 ip_hash trong cửa sổ thời gian — dedupe 1 click/IP/10'. */
    long countByCodeAndIpHashAndOccurredAtAfter(String code, String ipHash, Instant after);

    long countByCode(String code);

    /** Admin stats — activeClicks trong khoảng. */
    long countByOccurredAtBetween(Instant from, Instant to);
}
