package com.ecommerce.catalog.search;

import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.ResponseException;
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
 * PgFtsEngine (INFO); uri set → ping ES (timeout 2s) — ES là "chính" nhưng
 * EsEngine (search + indexer) hoàn thành ở Task 5/6, nên Task 4 này giữ
 * PgFtsEngine cho mọi nhánh và chỉ WARN khi ES reachable (seam interface +
 * config đã sẵn — Task 6 chỉ cần thay bean). ES unreachable → WARN degraded.
 * Không bao giờ 500 vì search.
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
        if (esReachable(esUri)) {
            log.warn("ES reachable ({}) nhưng EsEngine thuộc Task 5/6 — dùng PgFtsEngine (seam sẵn, Task 6 swap bean)",
                esUri);
            return pgFts;
        }
        log.warn("ES không reachable (uri={}) → degraded → PgFtsEngine", esUri);
        return pgFts;
    }

    /** Ping ES 2s — server TRẢ RESPONSE (kể cả 4xx/5xx) = reachable. */
    private static boolean esReachable(String uri) {
        try (RestClient client = RestClient.builder(HttpHost.create(uri))
                .setRequestConfigCallback(rc -> rc.setConnectTimeout(2_000).setSocketTimeout(2_000))
                .build()) {
            client.performRequest(new Request("GET", "/"));
            return true;
        } catch (ResponseException answered) {
            return true; // server sống, chỉ là status lỗi
        } catch (Exception e) {
            return false;
        }
    }
}
