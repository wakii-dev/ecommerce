package com.ecommerce.partner.web;

import com.ecommerce.partner.proxy.CatalogClient;
import com.ecommerce.partner.web.dto.PartnerDtos.PartnerCategory;
import com.ecommerce.partner.web.dto.PartnerDtos.PartnerProduct;
import com.ecommerce.partner.web.dto.PartnerDtos.PartnerProductDetail;
import com.ecommerce.partner.web.dto.PartnerDtos.PartnerProductPage;
import com.ecommerce.partner.web.dto.PartnerDtos.PartnerVariant;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Catalog đọc cho partner (contract partner-products) — proxy catalog REST,
 * map sang shape partner (không lộ field nội bộ). Path param {idOrSlug}:
 * slug là đường chính (public); UUID-shaped đi public by-id (PUBLISHED-only,
 * SF-4/FI-408 — GAP-3 interim admin-token đã xóa).
 */
@RestController
@RequestMapping("/open-api/v1")
@Validated
public class PartnerCatalogController {

    private static final int MAX_PAGE_SIZE = 100;

    private final CatalogClient catalog;

    public PartnerCatalogController(CatalogClient catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/products")
    public PartnerProductPage products(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String category) {
        JsonNode body = catalog.listProducts(page, size, category);
        return toPage(body);
    }

    @GetMapping("/products/{idOrSlug}")
    public PartnerProductDetail product(@PathVariable String idOrSlug) {
        JsonNode product = isUuid(idOrSlug)
            ? catalog.productById(idOrSlug)
            : catalog.productBySlug(idOrSlug);
        if (product == null || product.isNull()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy product");
        }
        return toDetail(product);
    }

    @GetMapping("/categories")
    public List<PartnerCategory> categories() {
        JsonNode tree = catalog.categories();
        List<PartnerCategory> flat = new ArrayList<>();
        flatten(tree, null, flat);
        return flat;
    }

    @GetMapping("/search")
    public PartnerProductPage search(
        @RequestParam @NotBlank @Size(min = 1, max = 200) String q,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size) {
        JsonNode body = catalog.search(q.trim(), page, size);
        return toPage(body);
    }

    // ── mapping (JsonNode catalog → shape partner) ──────────────────────────

    private static PartnerProductPage toPage(JsonNode body) {
        if (body == null || body.isNull()) {
            return new PartnerProductPage(List.of(), 1, MAX_PAGE_SIZE, 0);
        }
        List<PartnerProduct> items = new ArrayList<>();
        for (JsonNode item : body.path("items")) {
            items.add(toSummary(item));
        }
        return new PartnerProductPage(items,
            body.path("page").asInt(1), body.path("size").asInt(20), body.path("total").asLong(0));
    }

    private static PartnerProduct toSummary(JsonNode item) {
        Instant now = Instant.now(); // GAP-2: catalog public chưa có updatedAt
        return new PartnerProduct(
            item.path("id").asText(),
            item.path("slug").asText(),
            text(item, "name"),
            item.path("price").asLong(0),
            now);
    }

    private static PartnerProductDetail toDetail(JsonNode product) {
        long basePrice = product.path("price").asLong(0);
        List<PartnerVariant> variants = new ArrayList<>();
        for (JsonNode variant : product.path("variants")) {
            // Giá variant = base + priceDelta (convention catalog — như pricing ordering)
            variants.add(new PartnerVariant(
                variant.path("id").asText(),
                text(variant, "name"),
                basePrice + variant.path("priceDelta").asLong(0)));
        }
        return new PartnerProductDetail(
            product.path("id").asText(),
            product.path("slug").asText(),
            text(product, "name"),
            basePrice,
            Instant.now(),
            text(product, "description"),
            variants);
    }

    /** Cây → phẳng đệ quy (parentId = null cho gốc — contract PartnerCategory). */
    private static void flatten(JsonNode node, String parentId, List<PartnerCategory> out) {
        if (node == null || !node.isArray()) {
            return;
        }
        for (JsonNode category : node) {
            String id = category.path("id").asText();
            out.add(new PartnerCategory(
                id,
                category.path("slug").asText(),
                text(category, "name"),
                parentId));
            flatten(category.path("children"), id, out);
        }
    }

    /** Tên resolve: ưu tiên name (đã resolve vi) — fallback nameI18n.vi. */
    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        if (value == null || value.isBlank()) {
            value = node.path(field + "I18n").path("vi").asText(null);
        }
        return value == null ? "" : value;
    }

    private static boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
