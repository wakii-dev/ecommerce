package com.ecommerce.catalog.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.amqp.rabbit.listener.RabbitListenerEndpointRegistry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ecommerce.catalog.AbstractIntegrationTest;
import com.ecommerce.catalog.config.RabbitMqConfig;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.service.CatalogQueryService;
import com.ecommerce.catalog.web.dto.ProductDetailDto;
import com.ecommerce.common.outbox.OutboxRelay;
import com.ecommerce.common.outbox.OutboxWriter;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT Task 7 (spec Q13): Redis Testcontainer — cache-aside PDP/tree
 * (key canonical slugVi, TTL > 0), consumer {@code product.changed} E2E qua
 * outbox thật xóa {@code cat:prod:{slugVi/slugEn}:*} mọi locale (SCAN) nhưng
 * KHÔNG đụng tree keys, và Redis chết → bypass cache serve nguồn không throw.
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
class CacheInvalidateTest extends AbstractIntegrationTest {

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7").withExposedPorts(6379);

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        // port-listen ≠ broker ready — chờ log "Server startup complete" (như EsIndexerSearchTest)
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void redisAndRabbit(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        // E2E: relay publish thật + listener container chạy (override base tắt)
        registry.add("outbox.relay.enabled", () -> "true");
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "true");
    }

    @Autowired CatalogQueryService catalogQueryService;
    @Autowired ProductRepository productRepository;
    @Autowired ProductImageRepository imageRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired OutboxWriter outboxWriter;
    @Autowired OutboxRelay outboxRelay;
    @Autowired ObjectMapper objectMapper;
    @Autowired StringRedisTemplate redis;
    @Autowired PlatformTransactionManager txManager;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired RabbitListenerEndpointRegistry rabbitListeners;

    // ── (1) cache-aside: lần 2 từ Redis, key canonical slugVi (cả đường slugEn)

    @Test
    void detailTwiceServedFromRedisKeyedOnSlugVi() throws InterruptedException {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Điện thoại Xiaomi Redmi 13C", "Xiaomi Phone Redmi 13C");
        imageRepository.save(image(p, 0));

        ProductDetailDto first = catalogQueryService.getProduct(p.getSlugVi(), "vi");
        String keyVi = CatalogCacheService.detailKey(p.getSlugVi(), "vi");
        await("key cache PDP vi tồn tại", 5, () -> Boolean.TRUE.equals(redis.hasKey(keyVi)));
        assertThat(redis.getExpire(keyVi)).isGreaterThan(0); // TTL đã set (600s)

        ProductDetailDto second = catalogQueryService.getProduct(p.getSlugVi(), "vi");
        assertThat(second).isEqualTo(first); // cùng DTO — hit cache

        // lookup qua slugEn → cùng canonical key slugVi (locale vi), KHÔNG tạo key slugEn
        ProductDetailDto viaEn = catalogQueryService.getProduct(p.getSlugEn(), "vi");
        assertThat(viaEn).isEqualTo(first);
        assertThat(redis.hasKey(CatalogCacheService.detailKey(p.getSlugEn(), "vi"))).isFalse();
    }

    // ── (2) E2E: event product.changed UPDATED → xóa prod keys mọi locale,
    //         tree keys KHÔNG bị đụng (category write mới đổi tree — T8b)

    @Test
    void productChangedEventDeletesProductKeysAllLocalesNotTree() throws InterruptedException {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Máy xay sinh tố Philips", "Philips Blender Pro");
        imageRepository.save(image(p, 0));

        catalogQueryService.getProduct(p.getSlugVi(), "vi");
        catalogQueryService.getProduct(p.getSlugVi(), "en");
        // key theo slugEn (Q13 — pattern thứ hai của consumer phải quét được:
        // key format-cũ/rename tồn tại dưới slugEn của CHÍNH product này)
        String legacyEn = CatalogCacheService.detailKey(p.getSlugEn(), "vi");
        redis.opsForValue().set(legacyEn, "{}", java.time.Duration.ofSeconds(600));
        // tree key — phải SỐNG SÓT sau event product
        String treeKey = CatalogCacheService.TREE_KEY_PREFIX + "vi";
        redis.opsForValue().set(treeKey, "[]", java.time.Duration.ofSeconds(1800));

        String keyVi = CatalogCacheService.detailKey(p.getSlugVi(), "vi");
        String keyEn = CatalogCacheService.detailKey(p.getSlugVi(), "en");
        assertThat(redis.hasKey(keyVi)).isTrue();
        assertThat(redis.hasKey(keyEn)).isTrue();

        // Immune to auto-startup property precedence — start containers explicit
        // (registry.start() no-op khi đang chạy) — pattern EsIndexerSearchTest.
        rabbitListeners.getListenerContainers().forEach(container -> {
            try {
                if (!container.isRunning()) {
                    container.start();
                }
            } catch (Exception e) {
                throw new IllegalStateException("start listener container lỗi", e);
            }
        });

        TransactionTemplate tx = new TransactionTemplate(txManager);
        tx.executeWithoutResult(s -> outboxWriter.write(RabbitMqConfig.ROUTING_PRODUCT_CHANGED,
            objectMapper.valueToTree(java.util.Map.of(
                "productId", p.getId().toString(),
                "action", "UPDATED",
                "slugVi", p.getSlugVi(),
                "slugEn", p.getSlugEn(),
                "changedAt", Instant.now().toString())),
            "it-cache-updated"));

        outboxRelay.poll();
        await("relay publish xong (outbox SENT)", 15, () -> outboxStatus("it-cache-updated").equals("SENT"));
        // ĐỒNG BỘ QUA MARKER DB, KHÔNG poll redis: mọi lệnh redis từ main thread
        // trong lúc listener SCAN sẽ starve cursor trên shared lettuce connection
        // (đã xác chứng 6 lần chạy — poll 200ms/2s/sleep đều miss). Marker
        // "cache:{eventId}" (INSERT trong tx listener) chỉ visible SAU commit,
        // mà delete keys chạy TRƯỚC commit ⇒ marker thấy = keys đã xóa xong.
        await("cache consumer commit marker 'cache:'", 15, () -> {
            Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM processed_messages WHERE message_id LIKE 'cache:%'", Integer.class);
            return n != null && n >= 1;
        });
        assertThat(redis.hasKey(keyVi)).as("key vi bị xóa bởi event").isFalse();
        assertThat(redis.hasKey(keyEn)).as("key en bị xóa bởi event").isFalse();
        assertThat(redis.hasKey(legacyEn)).as("key slug-en legacy bị xóa").isFalse();
        assertThat(redis.hasKey(treeKey)).isTrue(); // tree KHÔNG bị xóa bởi event product
    }

    // ── (3) Redis chết → bypass cache, serve từ supplier, không throw (§5) ───

    @Test
    void redisDownBypassesCacheAndNeverThrows() {
        StringRedisTemplate broken = Mockito.mock(StringRedisTemplate.class);
        Mockito.when(broken.opsForValue()).thenThrow(new RedisConnectionFailureException("redis down"));
        Mockito.when(broken.execute(Mockito.any(org.springframework.data.redis.core.RedisCallback.class)))
            .thenThrow(new RedisConnectionFailureException("redis down"));
        CatalogCacheService cache = new CatalogCacheService(broken, objectMapper);

        ProductDetailDto served = new ProductDetailDto(
            UUID.randomUUID(), "slug", "slug-en", "Tên", "Brand", 1_000L, null, null,
            null, new BigDecimal("4.5"), 3, null, List.of(), null, "Mô tả", List.of(), List.of(), 0);
        AtomicBoolean loaderRan = new AtomicBoolean(false);

        ProductDetailDto result = cache.getOrLoadDetail("slug", "vi", () -> {
            loaderRan.set(true);
            return served;
        });

        assertThat(result).isEqualTo(served);
        assertThat(loaderRan).isTrue(); // bypass — loader chạy dù Redis chết
        // delete pattern (SCAN qua execute) cũng nuốt lỗi — consumer không requeue
        assertThatCode(() -> cache.deleteProductKeys("slug")).doesNotThrowAnyException();
    }

    // ── seed + helpers (copy pattern EsIndexerSearchTest) ────────────────────

    private String outboxStatus(String correlationId) {
        return jdbcTemplate.query(
            "SELECT status FROM outbox WHERE correlation_id = ? ORDER BY id DESC LIMIT 1",
            (rs, i) -> rs.getString(1), correlationId).stream().findFirst().orElse("MISSING");
    }

    private static void await(String what, int timeoutSeconds, Supplier<Boolean> condition)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
        while (System.currentTimeMillis() < deadline) {
            try {
                if (Boolean.TRUE.equals(condition.get())) {
                    return;
                }
            } catch (Exception transientError) {
                // poll tiếp tới deadline
            }
            Thread.sleep(200);
        }
        throw new AssertionError("timeout chờ: " + what);
    }

    private CategoryEntity seedCategory() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        CategoryEntity c = new CategoryEntity();
        c.setName(new I18nText("Điện Tử " + suffix, "Electronics " + suffix));
        c.setSlugVi("dien-tu-" + suffix);
        c.setSlugEn("electronics-" + suffix);
        return categoryRepository.save(c);
    }

    private ProductEntity seedProduct(CategoryEntity cat, String nameVi, String nameEn) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        ProductEntity p = new ProductEntity();
        p.setName(new I18nText(nameVi, nameEn));
        p.setDescription(new I18nText("Mô tả " + nameVi, "Description of " + nameEn));
        p.setSlugVi("san-pham-" + suffix);
        p.setSlugEn("product-" + suffix);
        p.setBrand("BrandX");
        p.setCategoryId(cat.getId());
        p.setStatus(ProductStatus.PUBLISHED);
        p.setPrice(1_990_000L);
        p.setRatingAvg(new BigDecimal("4.5"));
        p.setRatingCount(10);
        p.getTags().add("Chính hãng");
        return productRepository.save(p);
    }

    private ProductImageEntity image(ProductEntity p, int position) {
        ProductImageEntity img = new ProductImageEntity();
        img.setProductId(p.getId());
        img.setUrl("https://img.example/a.png");
        img.setAlt("alt " + position);
        img.setPosition(position);
        return img;
    }
}
