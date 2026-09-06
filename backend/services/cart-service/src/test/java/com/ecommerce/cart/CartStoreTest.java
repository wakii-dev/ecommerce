package com.ecommerce.cart;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.ecommerce.cart.domain.CartModels.CartDocument;
import com.ecommerce.cart.domain.CartModels.LineItem;
import com.ecommerce.cart.store.CartStore;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CartStore trên Redis THẬT (Testcontainers) — wiring TAY (không Spring context)
 * để test nhanh và tránh context-cache pitfall. Container SINGLETON per JVM
 * (static init, không @Container per-class — pattern catalog
 * AbstractIntegrationTest: context cache dùng chung JDBC/Redis URL của class
 * đầu tiên; container per-class chết làm class sau rơi vào bean chết).
 */
@Testcontainers(disabledWithoutDocker = true)
class CartStoreTest {

    @SuppressWarnings("resource")
    private static final GenericContainer<?> REDIS =
        new GenericContainer<>(DockerImageName.parse("redis:7")).withExposedPorts(6379);

    private static CartStore store;
    private static StringRedisTemplate redis;
    private static LettuceConnectionFactory connectionFactory;

    @BeforeAll
    static void setUp() {
        REDIS.start();
        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration(
            REDIS.getHost(), REDIS.getMappedPort(6379));
        connectionFactory = new LettuceConnectionFactory(config);
        connectionFactory.afterPropertiesSet();
        redis = new StringRedisTemplate(connectionFactory);
        store = new CartStore(redis, 30);
    }

    @AfterAll
    static void tearDown() {
        if (connectionFactory != null) {
            connectionFactory.destroy();
        }
    }

    private static LineItem line(UUID productId, UUID variantId, int qty) {
        return new LineItem(UUID.randomUUID(), productId, variantId, qty,
            "may-tinh-bang", "May tinh bang", "https://img/1.webp", 5000000, false);
    }

    @Test
    void saveLoadRoundtripPreservesLineIdentity() {
        String key = CartStore.guestKey(store.newGuestToken());
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        CartDocument doc = new CartDocument(
            List.of(line(productId, variantId, 2), line(productId, null, 1)),
            java.time.Instant.now());
        store.save(key, doc);

        Optional<CartDocument> loaded = store.load(key);
        assertThat(loaded).isPresent();
        assertThat(loaded.get().items()).hasSize(2);
        assertThat(loaded.get().items().get(0).productId()).isEqualTo(productId);
        assertThat(loaded.get().items().get(0).variantId()).isEqualTo(variantId);
        assertThat(loaded.get().items().get(1).variantId()).isNull(); // non-variant giữ null qua JSON
    }

    @Test
    void sameLineDedupesOnProductPlusVariant() {
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        LineItem withVariant = line(productId, variantId, 1);
        LineItem sameVariant = new LineItem(UUID.randomUUID(), productId, variantId, 1,
            null, null, null, 5000000, false);
        LineItem nonVariant = line(productId, null, 1);

        assertThat(withVariant.sameLine(sameVariant)).isTrue();   // trùng product+variant → cộng qty
        assertThat(withVariant.sameLine(nonVariant)).isFalse();   // variant != null → khác line
    }

    @Test
    void saveSetsTtlAndDeleteRemoves() {
        String key = CartStore.guestKey(store.newGuestToken());
        store.save(key, CartDocument.empty());
        Long ttl = redis.getExpire(key);
        assertThat(ttl).isNotNull();
        assertThat(ttl).isBetween(Duration.ofDays(29).toSeconds(), Duration.ofDays(30).toSeconds());

        store.delete(key);
        assertThat(store.load(key)).isEmpty();
    }

    @Test
    void corruptedJsonLoadsAsEmptyNotThrow() {
        String key = CartStore.guestKey(store.newGuestToken());
        redis.opsForValue().set(key, "{not-json");
        assertThat(store.load(key)).isEmpty();
    }
}
