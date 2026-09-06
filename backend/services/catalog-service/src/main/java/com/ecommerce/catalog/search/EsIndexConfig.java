package com.ecommerce.catalog.search;

import java.io.IOException;

import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestClient;

/**
 * Mapping index ES {@code products} (plan Task 5, spec Q3): fields per-locale
 * {@code name.vi/.en}, {@code description.vi/.en} text qua analyzer
 * {@code vi_fold} (standard + lowercase + asciifolding — parity unaccent của
 * PgFtsEngine: q "dien thoai" không dấu vẫn khớp "Điện Thoại"); keyword cho
 * brand/categorySlugs/tags/slug/status; số học price/discount/
 * rating; date flashSaleEndsAt/createdAt. Query build raw JSON qua Jackson
 * (Q3 — toàn quyền DSL, không typed client). Tạo-if-missing lúc startup —
 * mapping cố định, KHÔNG auto migration (đổi mapping = đổi version index).
 */
public final class EsIndexConfig {

    public static final String INDEX = "products";

    private static final String MAPPING = """
        {
          "settings": {
            "analysis": {
              "analyzer": {
                "vi_fold": {"type": "custom", "tokenizer": "standard",
                            "filter": ["lowercase", "asciifolding"]}
              }
            }
          },
          "mappings": {
            "properties": {
              "productId":      {"type": "keyword"},
              "name":           {"properties": {
                                   "vi": {"type": "text", "analyzer": "vi_fold"},
                                   "en": {"type": "text", "analyzer": "vi_fold"}}},
              "description":    {"properties": {
                                   "vi": {"type": "text", "analyzer": "vi_fold"},
                                   "en": {"type": "text", "analyzer": "vi_fold"}}},
              "brand":          {"type": "keyword"},
              "categorySlugs":  {"type": "keyword"},
              "price":          {"type": "long"},
              "discount":       {"type": "double"},
              "ratingAvg":      {"type": "double"},
              "ratingCount":    {"type": "integer"},
              "official":       {"type": "boolean"},
              "status":         {"type": "keyword"},
              "tags":           {"type": "keyword"},
              "slugVi":         {"type": "keyword"},
              "slugEn":         {"type": "keyword"},
              "flashSaleEndsAt":{"type": "date"},
              "imageUrl":       {"type": "keyword"},
              "imageAlt":       {"type": "text"},
              "createdAt":      {"type": "date"}
            }
          }
        }
        """;

    private EsIndexConfig() {
    }

    /**
     * Tạo index if-missing (HEAD 404 → PUT mapping). Lỗi khác ném ra — caller
     * quyết định fallback. <strong>CẮT>:</strong> low-level RestClient KHÔNG
     * ném ResponseException cho HEAD 404 — nó TRẢ RESPONSE bình thường
     * (exists-check là use case chính của HEAD) — phải đọc status code, đừng
     * trông cậy try/catch (bug thật: index tạo bằng dynamic mapping, term
     * keyword fail ngầm).
     */
    public static void ensureIndex(RestClient client) throws IOException {
        int headStatus;
        try {
            headStatus = client.performRequest(new Request("HEAD", "/" + INDEX))
                .getStatusLine().getStatusCode();
        } catch (ResponseException e) {
            headStatus = e.getResponse().getStatusLine().getStatusCode();
            if (headStatus != 404) {
                throw e;
            }
        }
        if (headStatus != 200) {
            Request create = new Request("PUT", "/" + INDEX);
            create.setJsonEntity(MAPPING);
            client.performRequest(create);
        }
    }

    /** RestClient ngắn hạn cho ping/IT — không dùng cho engine (engine giữ client riêng). */
    public static RestClient restClient(String uri, int connectTimeoutMs, int socketTimeoutMs) {
        return RestClient.builder(HttpHost.create(uri))
            .setRequestConfigCallback(rc -> rc.setConnectTimeout(connectTimeoutMs).setSocketTimeout(socketTimeoutMs))
            .build();
    }
}
