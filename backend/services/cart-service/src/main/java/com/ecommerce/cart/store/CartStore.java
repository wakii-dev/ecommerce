package com.ecommerce.cart.store;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.ecommerce.cart.domain.CartModels.CartDocument;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * Store giỏ hàng trên Redis (SF-6) — NƠI DUY NHẤT đụng Redis.
 *
 * <p>Key: {@code cart:guest:{token}} (guest theo cookie cart_token) /
 * {@code cart:user:{sub}} (user theo JWT). Value = JSON {@link CartDocument}.
 * TTL {@code cart.ttl-days} (mặc định 30 ngày) — refresh MỖI lần write nên
 * giỏ "sống" miễn còn hoạt động.</p>
 */
@Component
public class CartStore {

    private final StringRedisTemplate redis;
    /** Mapper RIÊNG của store (không inject) — bắt buộc JavaTimeModule vì
     * CartDocument.updatedAt là Instant; mapper thuần chết khi serialize. */
    private final ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final Duration ttl;

    public CartStore(StringRedisTemplate redis,
                     @Value("${cart.ttl-days:30}") long ttlDays) {
        this.redis = redis;
        this.ttl = Duration.ofDays(ttlDays);
    }

    public static String guestKey(String token) {
        return "cart:guest:" + token;
    }

    public static String userKey(String sub) {
        return "cart:user:" + sub;
    }

    /** Token guest mới (UUID) — server cấp qua POST /api/cart hoặc auto-create lúc add. */
    public String newGuestToken() {
        return UUID.randomUUID().toString();
    }

    public Optional<CartDocument> load(String key) {
        String json = redis.opsForValue().get(key);
        if (json == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(json, CartDocument.class));
        } catch (Exception e) {
            // JSON hỏng (nhiễu tay/đổi model) → coi như giỏ rỗng, KHÔNG 500 user
            return Optional.empty();
        }
    }

    /** Ghi + refresh TTL. */
    public void save(String key, CartDocument document) {
        try {
            redis.opsForValue().set(key, objectMapper.writeValueAsString(document), ttl);
        } catch (Exception e) {
            throw new IllegalStateException("Serialize cart fail", e);
        }
    }

    public void delete(String key) {
        redis.delete(key);
    }
}
