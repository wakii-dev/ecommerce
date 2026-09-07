package com.ecommerce.catalog.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ecommerce.catalog.AbstractIntegrationTest;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;

/**
 * IT related products (SF-13 A6b — Task 8): ES more_like_this + fill cùng
 * category, exclude self, slug lạ → rỗng (200), endpoint public qua REST.
 * Pattern harness copy EsIndexerSearchTest (ES + Rabbit containers).
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
class RelatedTest extends AbstractIntegrationTest {

    @Container
    static final ElasticsearchContainer ELASTIC = new ElasticsearchContainer(
        "docker.elastic.co/elasticsearch/elasticsearch:8.17.4")
        .withEnv("xpack.security.enabled", "false");

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void esAndRabbit(DynamicPropertyRegistry registry) {
        registry.add("elasticsearch.uri", () -> "http://" + ELASTIC.getHttpHostAddress());
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        registry.add("outbox.relay.enabled", () -> "false");
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "false");
    }

    @Autowired SearchEngine searchEngine;
    @Autowired ProductRepository productRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired TestRestTemplate http;

    @org.junit.jupiter.api.Test
    void related_excludesSelf_fillsSameCategory() {
        CategoryEntity cat = seedCategory();
        ProductEntity self = seedProduct(cat, "Điện thoại Xiaomi Redmi 13C", "Xiaomi Redmi 13C Phone",
            1_990_000L, 2_900_000L);
        ProductEntity sibling = seedProduct(cat, "Điện thoại Xiaomi Redmi 12", "Xiaomi Redmi 12 Phone",
            1_500_000L, null);
        seedProduct(otherCategory(), "Máy lọc không khí Samsung", "Samsung Air Purifier",
            3_200_000L, null);

        // index đủ 3 doc
        searchEngine.index(self);
        searchEngine.index(sibling);

        ProductCardPageDto related = searchEngine.related(self.getSlugVi(), "vi", 8);

        // ít nhất sibling (cùng category + tên tương tự) xuất hiện; KHÔNG chứa self
        assertThat(related.items()).extracting(c -> c.id()).contains(sibling.getId());
        assertThat(related.items()).extracting(c -> c.id()).doesNotContain(self.getId());
        assertThat(related.items().size()).isLessThanOrEqualTo(8);
    }

    @org.junit.jupiter.api.Test
    void unknownSlug_emptyPage200_draftExcluded() {
        assertThat(searchEngine.related("slug-khong-ton-tai", "vi", 8).total()).isEqualTo(0);

        // DRAFT — không trả trong related
        CategoryEntity cat = seedCategory();
        ProductEntity draft = seedProduct(cat, "Tủ lạnh Panasonic Draft", "Panasonic Fridge Draft",
            9_000_000L, null);
        draft.setStatus(ProductStatus.DRAFT);
        productRepository.save(draft);
        assertThat(searchEngine.related(draft.getSlugVi(), "vi", 8).total()).isEqualTo(0);
    }

    @org.junit.jupiter.api.Test
    void endpointRest_public200() {
        CategoryEntity cat = seedCategory();
        ProductEntity p = seedProduct(cat, "Loa Bluetooth JBL", "JBL Bluetooth Speaker", 1_200_000L, null);
        searchEngine.index(p);

        var res = http.getForEntity("/api/catalog/products/" + p.getSlugVi() + "/related?size=8",
            ProductCardPageDto.class);
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().items()).extracting(c -> c.id()).doesNotContain(p.getId());
    }

    // ── helpers (pattern EsIndexerSearchTest) ───────────────────────────────

    private CategoryEntity seedCategory() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        CategoryEntity c = new CategoryEntity();
        c.setName(new I18nText("Điện Tử " + suffix, "Electronics " + suffix));
        c.setSlugVi("dien-tu-" + suffix);
        c.setSlugEn("electronics-" + suffix);
        return categoryRepository.save(c);
    }

    private CategoryEntity otherCategory() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        CategoryEntity c = new CategoryEntity();
        c.setName(new I18nText("Gia Dụng " + suffix, "Home " + suffix));
        c.setSlugVi("gia-dung-" + suffix);
        c.setSlugEn("home-" + suffix);
        return categoryRepository.save(c);
    }

    private ProductEntity seedProduct(CategoryEntity cat, String nameVi, String nameEn,
                                      long price, Long comparePrice) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        ProductEntity p = new ProductEntity();
        p.setName(new I18nText(nameVi, nameEn));
        p.setDescription(new I18nText("Mô tả " + nameVi + " chất lượng cao", "Description of " + nameEn));
        p.setSlugVi("san-pham-" + suffix);
        p.setSlugEn("product-" + suffix);
        p.setBrand("BrandX");
        p.setCategoryId(cat.getId());
        p.setStatus(ProductStatus.PUBLISHED);
        p.setPrice(price);
        p.setComparePrice(comparePrice);
        p.setRatingAvg(new BigDecimal("4.5"));
        p.setRatingCount(10);
        return productRepository.save(p);
    }
}
