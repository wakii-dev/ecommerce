package com.ecommerce.catalog.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.function.Supplier;

import org.elasticsearch.client.Request;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestClient;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.listener.RabbitListenerEndpointRegistry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
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
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.SuggestResponseDto;
import com.ecommerce.common.outbox.OutboxRelay;
import com.ecommerce.common.outbox.OutboxWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT Task 5/6 (spec Q3/Q16): ES Testcontainer + RabbitMQ — indexer per-locale
 * fields, search/suggest per-locale + hydrate PG, reindexAll đếm đúng published,
 * listener E2E qua outbox (CREATED → doc có, DELETED → doc biến mất), ES chết
 * runtime → delegate PgFts không 500. Seed qua repository (base tắt seed).
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
class EsIndexerSearchTest extends AbstractIntegrationTest {

    @Container
    static final ElasticsearchContainer ELASTIC = new ElasticsearchContainer(
        "docker.elastic.co/elasticsearch/elasticsearch:8.17.4")
        .withEnv("xpack.security.enabled", "false");

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        // port-listen ≠ broker ready — AMQP frame bị RST khi rabbit app còn boot
        // ("Connection reset", "Failed to check/redeclare queue") → chờ log này.
        .waitingFor(org.testcontainers.containers.wait.strategy.Wait
            .forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void esAndRabbit(DynamicPropertyRegistry registry) {
        registry.add("elasticsearch.uri", () -> "http://" + ELASTIC.getHttpHostAddress());
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        // E2E listener: relay publish thật + listener container chạy
        registry.add("outbox.relay.enabled", () -> "true");
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "true");
    }

    @Autowired SearchEngine searchEngine;
    @Autowired ProductRepository productRepository;
    @Autowired ProductImageRepository imageRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired OutboxWriter outboxWriter;
    @Autowired OutboxRelay outboxRelay;
    @Autowired ObjectMapper objectMapper;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txManager;
    @Autowired RabbitListenerEndpointRegistry rabbitListeners;
    @Autowired JdbcTemplate jdbcTemplate;

    // ── (1) index doc per-locale + discount ──────────────────────────────────

    @Test
    void indexDocHasPerLocaleFieldsAndDiscount() throws Exception {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Điện thoại Xiaomi Redmi 13C", "Xiaomi Phone Redmi 13C",
            1_990_000L, 2_900_000L);
        imageRepository.save(image(p, 0));
        imageRepository.save(image(p, 1));

        searchEngine.index(p);

        JsonNode doc = awaitDoc(p.getId(), 5);
        assertThat(doc.path("_source").path("name").path("vi").asText())
            .isEqualTo("Điện thoại Xiaomi Redmi 13C");
        assertThat(doc.path("_source").path("name").path("en").asText())
            .isEqualTo("Xiaomi Phone Redmi 13C");
        double discount = doc.path("_source").path("discount").asDouble();
        assertThat(discount).isBetween((910_000.0) / 2_900_000 - 1e-9, (910_000.0) / 2_900_000 + 1e-9);
        assertThat(doc.path("_source").path("categorySlugs").toString())
            .contains("dien-tu").contains("electronics");
        assertThat(doc.path("_source").path("imageUrl").asText()).isEqualTo("https://img.example/a.png");
    }

    // ── (2) search per-locale: q vi khớp name.vi, ?locale=en khớp name.en ────

    @Test
    void searchMatchesPerLocaleFields() {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Máy xay sinh tố Philips", "Philips Blender Pro", 899_000L, null);
        searchEngine.index(p);

        // q vi → khớp name.vi/description.vi (operator AND: "máy"+"xay" đều có trong name.vi)
        ProductCardPageDto vi = searchEngine.search(query("máy xay", "vi"));
        assertThat(vi.total()).isGreaterThan(0);
        assertThat(vi.items()).extracting(c -> c.id()).contains(p.getId());

        // ?locale=en → multi_match trên name.en^3/description.en
        ProductCardPageDto en = searchEngine.search(query("philips blender", "en"));
        assertThat(en.total()).isGreaterThan(0);
        assertThat(en.items()).extracting(c -> c.id()).contains(p.getId());
        assertThat(en.items()).allSatisfy(c -> assertThat(c.slug()).isEqualTo(p.getSlugEn()));
    }

    // ── (3) suggest prefix ≤5 + categories từ PG ─────────────────────────────

    @Test
    void suggestReturnsAtMostFiveAndCategories() throws Exception {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Điện thoại Nokia 110", "Nokia 110 Phone", 490_000L, null);
        searchEngine.index(p);
        await("doc visible trước suggest", 5, () -> {
            JsonNode doc = getDoc(p.getId());
            return doc != null && doc.path("found").asBoolean(false);
        });

        SuggestResponseDto suggest = searchEngine.suggest("điện", "vi");
        assertThat(suggest.products().size()).isLessThanOrEqualTo(5);
        assertThat(suggest.products())
            .as("suggest ES phải thấy doc vừa index (visible qua refresh=wait_for)")
            .extracting(c -> c.id()).contains(p.getId());
        assertThat(suggest.categories().size()).isLessThanOrEqualTo(5);
        // Categories: PG ilike ORDER BY created_at LIMIT 5 — DB IT chứa nhiều cat
        // "Điện Tử *" (singleton PG dùng chung các class) → cat VỪA seed (mới nhất)
        // bị cắt khỏi top 5 của term chung "điện". Assert qua term chứa suffix duy
        // nhất → chỉ cat này khớp, không phụ thuộc dataset (production đúng spec ≤5).
        String suffix = cat.getSlugVi().substring("dien-tu-".length());
        SuggestResponseDto catSuggest = searchEngine.suggest("điện tử " + suffix, "vi");
        assertThat(catSuggest.categories())
            .anySatisfy(c -> assertThat(c.slug()).isEqualTo(cat.getSlugVi()));
    }

    // ── (4) reindexAll → _count == số PUBLISHED trong PG ─────────────────────

    @Test
    void reindexAllCountsOnlyPublished() throws Exception {
        CategoryEntity cat = seedCategory();
        ProductEntity p1 = seedProduct(cat, "Tai nghe Bluetooth Sony", "Sony Bluetooth Headset", 1_290_000L, null);
        seedProduct(cat, "Áo thun nam", "Men T-Shirt", 199_000L, 299_000L);
        seedProduct(cat, "Sách Nhà Giả Kim", "The Alchemist", 120_000L, null);
        ProductEntity draft = seedProduct(cat, "Bản nháp ẩn", "Hidden Draft", 1L, null);
        draft.setStatus(ProductStatus.DRAFT);
        productRepository.save(draft);

        searchEngine.reindexAll();
        await("reindex bulk visible", 5, () -> esCount() == publishedInPg());
        assertThat(esCount()).isEqualTo(publishedInPg());
        assertThat(publishedInPg()).isGreaterThanOrEqualTo(3); // p1 + 2 published vừa seed

        JsonNode doc = awaitDoc(p1.getId(), 5);
        assertThat(doc.path("_source").path("slugVi").asText()).isEqualTo(p1.getSlugVi());
    }

    // ── (5) listener E2E: outbox → relay → exchange → doc; DELETED → gone ────

    @Test
    void listenerIndexesOnCreatedAndRemovesOnDeleted() throws Exception {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Laptop ASUS VivoBook", "ASUS VivoBook Laptop", 15_990_000L, null);

        // Immune to auto-startup property precedence — start containers explicit
        // (registry.start() no-op khi đang chạy).
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
                "action", "CREATED",
                "slugVi", p.getSlugVi(),
                "slugEn", p.getSlugEn(),
                "changedAt", Instant.now().toString())),
            "it-es-created"));

        outboxRelay.poll();
        await("relay publish xong (outbox SENT)", 15, () -> outboxStatus("it-es-created").equals("SENT"));
        await("listener index doc qua event", 15, () -> {
            JsonNode doc = getDoc(p.getId());
            return doc != null && doc.path("found").asBoolean(false);
        });

        tx.executeWithoutResult(s -> outboxWriter.write(RabbitMqConfig.ROUTING_PRODUCT_CHANGED,
            objectMapper.valueToTree(java.util.Map.of(
                "productId", p.getId().toString(),
                "action", "DELETED",
                "slugVi", p.getSlugVi(),
                "slugEn", p.getSlugEn(),
                "changedAt", Instant.now().toString())),
            "it-es-deleted"));

        outboxRelay.poll();
        await("listener xóa doc qua event DELETED", 10, () -> getDoc(p.getId()) == null);
    }

    private String outboxStatus(String correlationId) {
        return jdbcTemplate.query(
            "SELECT status FROM outbox WHERE correlation_id = ? ORDER BY id DESC LIMIT 1",
            (rs, i) -> rs.getString(1), correlationId).stream().findFirst().orElse("MISSING");
    }

    // ── (6) ES chết runtime → delegate PgFts, không exception ────────────────

    @Test
    void esDownDelegatesToPgFtsWithoutThrowing() {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Nồi chiên không dầu Lock&Lock", "Air Fryer Lock&Lock",
            2_190_000L, null);

        PgFtsEngine pgFts = new PgFtsEngine(jdbc, productRepository, imageRepository,
            categoryRepository, objectMapper);
        RestClient dead = EsIndexConfig.restClient("http://localhost:59999", 300, 800);
        try {
            EsEngine unreachable = new EsEngine(dead, objectMapper, pgFts, productRepository,
                imageRepository, categoryRepository, jdbc);

            ProductCardPageDto page = unreachable.search(query("nồi chiên", "vi"));
            assertThat(page.items()).extracting(c -> c.id()).contains(p.getId()); // PG path sống

            SuggestResponseDto suggest = unreachable.suggest("nồi", "vi");
            assertThat(suggest.products()).extracting(c -> c.id()).contains(p.getId());
            assertThat(unreachable.name()).isEqualTo("es");
        } finally {
            close(dead);
        }
    }

    // ── seed + ES helpers ────────────────────────────────────────────────────

    private SearchQuery query(String q, String locale) {
        return new SearchQuery(q, locale, null, null, null, null, null, null, null, 1, 10);
    }

    private int publishedInPg() {
        return (int) productRepository.findAll().stream()
            .filter(p -> p.getStatus() == ProductStatus.PUBLISHED && p.getDeletedAt() == null)
            .count();
    }

    private int esCount() {
        try (RestClient client = elastic()) {
            return objectMapper.readTree(client.performRequest(
                    new Request("GET", "/products/_count")).getEntity().getContent())
                .path("count").asInt();
        } catch (Exception e) {
            return -1;
        }
    }

    /** Poll GET /products/_doc/{id} tới khi thấy (null = chưa/đã xóa). */
    private JsonNode awaitDoc(UUID productId, int timeoutSeconds) throws InterruptedException {
        await("doc " + productId, timeoutSeconds, () -> {
            JsonNode doc = getDoc(productId);
            return doc != null && doc.path("found").asBoolean(false);
        });
        return getDoc(productId);
    }

    private JsonNode getDoc(UUID productId) {
        try (RestClient client = elastic()) {
            return objectMapper.readTree(client.performRequest(
                    new Request("GET", "/products/_doc/" + productId)).getEntity().getContent());
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return null;
            }
            throw new IllegalStateException("ES get doc lỗi", e);
        } catch (Exception e) {
            throw new IllegalStateException("ES get doc lỗi", e);
        }
    }

    private static RestClient elastic() {
        return EsIndexConfig.restClient("http://" + ELASTIC.getHttpHostAddress(), 2_000, 5_000);
    }

    private static void close(RestClient client) {
        try {
            client.close();
        } catch (Exception ignored) {
            // test cleanup
        }
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

    private ProductEntity seedProduct(CategoryEntity cat, String nameVi, String nameEn,
                                      long price, Long comparePrice) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        ProductEntity p = new ProductEntity();
        p.setName(new I18nText(nameVi, nameEn));
        p.setDescription(new I18nText("Mô tả " + nameVi, "Description of " + nameEn));
        p.setSlugVi("san-pham-" + suffix);
        p.setSlugEn("product-" + suffix);
        p.setBrand("BrandX");
        p.setCategoryId(cat.getId());
        p.setStatus(ProductStatus.PUBLISHED);
        p.setPrice(price);
        p.setComparePrice(comparePrice);
        p.setRatingAvg(new BigDecimal("4.5"));
        p.setRatingCount(10);
        p.getTags().add("Chính hãng");
        return productRepository.save(p);
    }

    private ProductImageEntity image(ProductEntity p, int position) {
        ProductImageEntity img = new ProductImageEntity();
        img.setProductId(p.getId());
        img.setUrl("https://img.example/" + (position == 0 ? "a" : "b") + ".png");
        img.setAlt("alt " + position);
        img.setPosition(position);
        return img;
    }
}
