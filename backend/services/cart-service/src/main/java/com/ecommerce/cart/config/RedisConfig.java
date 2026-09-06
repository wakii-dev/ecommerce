package com.ecommerce.cart.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Redis store giỏ hàng (SF-6) — giá trị là CHUỖI JSON serialize qua
 * {@code ObjectMapper} (pattern catalog RedisConfig: record +
 * {@code GenericJackson2JsonRedisTemplate} default-typing không khớp sạch ⇒
 * {@link StringRedisTemplate} là đủ). Serialize đặt ở {@code CartStore} —
 * nơi duy nhất đụng Redis.
 *
 * <p>Keys: {@code cart:guest:{token}} · {@code cart:user:{sub}} — TTL
 * {@code cart.ttl-days} (30d), refresh mỗi write.</p>
 */
@Configuration
public class RedisConfig {

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }
}
