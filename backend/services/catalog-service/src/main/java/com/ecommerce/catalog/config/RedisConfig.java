package com.ecommerce.catalog.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Redis cache-aside catalog (plan Task 7, spec Q13): giá trị cache là CHUỖI
 * JSON serialize qua {@code ObjectMapper} (DTO là record —
 * {@code GenericJackson2JsonRedisTemplate} default-typing không khớp record
 * sạch) ⇒ chỉ cần {@link StringRedisTemplate} (key + value đều String).
 * Bean khai báo tường minh để Boot auto-config backing-off — semantics
 * serialize đặt ở {@code CatalogCacheService} (nơi duy nhất đụng Redis).
 *
 * <p>Keys: {@code cat:prod:{slugVi}:{locale}} TTL 600s, {@code cat:cat-tree:
 * {locale}} TTL 1800s. {@code cat:home:*} BỎ (Next.js ISR 60s đã cache home
 * listing — deviation plan Task 7, coordinator duyệt trong dispatch).</p>
 */
@Configuration
public class RedisConfig {

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }
}
