package com.ecommerce.partner.auth;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rate-limit per API key — Bucket4j in-memory (ADR-11a): capacity =
 * partners.rate_limit_per_min, refill greedy trong 60s. Bucket cache theo
 * keyId — đổi rate_limit_per_min nhận hiệu lực sau restart (MVP chấp nhận;
 * multi-instance → bucket4j-redis).
 */
@Component
public class PartnerRateLimiter {

    private final Map<UUID, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * @return_remaining > 0 → được đi tiếp; ngược lại partner vượt quota —
     *         secondsToRefill cho header Retry-After (làm tròn lên).
     */
    public ConsumptionProbe tryConsume(UUID keyId, int rateLimitPerMin) {
        Bucket bucket = buckets.computeIfAbsent(keyId,
            id -> Bucket.builder()
                .addLimit(Bandwidth.builder()
                    .capacity(rateLimitPerMin)
                    .refillGreedy(rateLimitPerMin, Duration.ofMinutes(1))
                    .build())
                .build());
        return bucket.tryConsumeAndReturnRemaining(1);
    }

    /** Giây còn thiếu đến token kế (làm tròn lên, tối thiểu 1). */
    public static long retryAfterSeconds(ConsumptionProbe probe) {
        long seconds = Duration.ofNanos(probe.getNanosToWaitForRefill()).toSeconds();
        return Math.max(1, seconds);
    }
}
