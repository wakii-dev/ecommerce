package com.ecommerce.catalog.search;

import org.elasticsearch.client.RestClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;

/**
 * Chọn SearchEngine lúc startup (D15): {@code elasticsearch.uri} rỗng →
 * PgFtsEngine (INFO); uri set → ping ES (timeout 2s): reachable → EsEngine
 * (Task 5/6 — INFO; startup reindex chạy qua {@link StartupReindexRunner}),
 * unreachable → PgFtsEngine (WARN degraded). Tạo index if-missing lúc chọn
 * engine — fail → PgFts (WARN, ES quá flaky lúc boot). Không bao giờ 500
 * vì search — ES chết runtime → EsEngine tự degrade PgFts (Q16).
 */
@Configuration
public class SearchEngineConfig {

    private static final Logger log = LoggerFactory.getLogger(SearchEngineConfig.class);

    @Bean
    public SearchEngine searchEngine(
            @Value("${elasticsearch.uri:}") String esUri,
            NamedParameterJdbcTemplate jdbcTemplate,
            ProductRepository productRepository,
            ProductImageRepository imageRepository,
            CategoryRepository categoryRepository,
            ObjectMapper objectMapper) {
        PgFtsEngine pgFts = new PgFtsEngine(jdbcTemplate, productRepository, imageRepository,
            categoryRepository, objectMapper);
        if (esUri == null || esUri.isBlank()) {
            log.info("elasticsearch.uri rỗng → chọn PgFtsEngine");
            return pgFts;
        }
        if (!esReachable(esUri)) {
            log.warn("ES không reachable (uri={}) → degraded → PgFtsEngine", esUri);
            return pgFts;
        }
        RestClient client = EsIndexConfig.restClient(esUri, 2_000, 5_000);
        try {
            EsIndexConfig.ensureIndex(client);
        } catch (Exception e) {
            log.warn("ES reachable ({}) nhưng tạo index products lỗi → PgFtsEngine (WARN degraded)", esUri, e);
            closeQuietly(client);
            return pgFts;
        }
        log.info("EsEngine active (uri={}) — startup reindex chạy qua StartupReindexRunner", esUri);
        return new EsEngine(client, objectMapper, pgFts, productRepository, imageRepository,
            categoryRepository, jdbcTemplate);
    }

    /** Ping ES 2s — server TRẢ RESPONSE (kể cả 4xx/5xx) = reachable. */
    private static boolean esReachable(String uri) {
        try (RestClient client = EsIndexConfig.restClient(uri, 2_000, 2_000)) {
            client.performRequest(new org.elasticsearch.client.Request("GET", "/"));
            return true;
        } catch (org.elasticsearch.client.ResponseException answered) {
            return true; // server sống, chỉ là status lỗi
        } catch (Exception e) {
            return false;
        }
    }

    private static void closeQuietly(RestClient client) {
        try {
            client.close();
        } catch (Exception ignored) {
            // shutdown path — không còn gì làm
        }
    }
}
