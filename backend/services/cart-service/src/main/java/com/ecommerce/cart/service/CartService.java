package com.ecommerce.cart.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.ecommerce.cart.domain.CartModels.CartDocument;
import com.ecommerce.cart.domain.CartModels.LineItem;
import com.ecommerce.cart.service.CatalogEnricher.Outcome;
import com.ecommerce.cart.service.CatalogEnricher.ProductView;
import com.ecommerce.cart.service.CatalogEnricher.Result;
import com.ecommerce.cart.store.CartStore;
import com.ecommerce.cart.web.dto.CartDtos.CartItemResponse;
import com.ecommerce.cart.web.dto.CartDtos.CartResponse;

/**
 * Business logic giỏ hàng (SF-6) — resolve identity guest/user, line identity
 * dedupe (§6.1.4), enrichment slug-hint (REQUIREMENT-GAP FI-310), unavailable
 * filter (§6.1.2 — cart KHÔNG tự xóa item).
 *
 * <p>Giá hiển thị = enrich hiện tại của catalog; authority thật là re-price
 * của ordering lúc POST /orders (SF-9) — cart chỉ là duyệt (§6.1.1).</p>
 */
@Service
public class CartService {

    static final int MAX_QTY_PER_LINE = 99;

    private final CartStore store;
    private final CatalogEnricher catalog;
    private final InventoryChecker inventory;

    public CartService(CartStore store, CatalogEnricher catalog, InventoryChecker inventory) {
        this.store = store;
        this.catalog = catalog;
        this.inventory = inventory;
    }

    /** Ref giỏ sau resolve — guestToken != null nếu đây là giỏ GUEST (cookie). */
    public record CartRef(String key, String guestToken, CartDocument doc) {
    }

    // ── Identity resolution ────────────────────────────────────────────────

    /** User đã đăng nhập: giỏ theo {@code sub}; chưa có → tạo giỏ rỗng. */
    public CartRef loadOrCreateUser(String sub) {
        String key = CartStore.userKey(sub);
        CartDocument doc = store.load(key).orElseGet(CartDocument::empty);
        return new CartRef(key, null, doc);
    }

    /** Guest theo cookie; không có cookie → empty (GET phải 404 — KHÔNG auto-create). */
    public Optional<CartRef> loadGuest(String cookieToken) {
        if (cookieToken == null || cookieToken.isBlank()) {
            return Optional.empty();
        }
        return store.load(CartStore.guestKey(cookieToken))
            .map(doc -> new CartRef(CartStore.guestKey(cookieToken), cookieToken, doc));
    }

    /** Guest auto-create khi add-item — trả ref mới kèm token để set cookie. */
    public CartRef createGuest() {
        String token = store.newGuestToken();
        return new CartRef(CartStore.guestKey(token), token, CartDocument.empty());
    }

    // ── Enrichment ─────────────────────────────────────────────────────────

    /**
     * Enrich từng item từ catalog (slug hint) + inventory (variant):
     * catalog 200 → refresh snapshot, unavailable=false (trừ khi inventory OOS);
     * PRODUCT_MISSING → unavailable=true GIỮ snapshot (§6.1.2 — không tự xóa);
     * CATALOG_DOWN → giữ nguyên snapshot + trạng thái unavailable cũ.
     */
    public CartDocument enrichAll(CartDocument doc) {
        if (doc.items().isEmpty()) {
            return doc;
        }
        List<UUID> variantIds = doc.items().stream()
            .map(LineItem::variantId)
            .filter(java.util.Objects::nonNull)
            .toList();
        Map<String, Integer> availability = inventory.availabilityOf(variantIds);

        List<LineItem> enriched = new ArrayList<>(doc.items().size());
        for (LineItem item : doc.items()) {
            enriched.add(enrichOne(item, availability));
        }
        return doc.withItems(enriched);
    }

    private LineItem enrichOne(LineItem item, Map<String, Integer> availability) {
        // code-review P1: KHÔNG reset unavailable — catalog DOWN phải GIỮ trạng
        // thái trước đó (item OOS/unpublished không được "sống lại" ảo).
        boolean unavailable = item.unavailable();
        String name = item.name();
        String image = item.image();
        long unitPrice = item.unitPrice();

        if (item.slug() != null && !item.slug().isBlank()) {
            Result result = catalog.fetchBySlug(item.slug());
            if (result.outcome() == Outcome.OK) {
                ProductView product = result.product();
                name = product.name();
                image = product.image() != null ? product.image().url() : image;
                unitPrice = product.price() + product.priceDeltaOf(item.variantId()).orElse(0L);
                unavailable = false; // catalog sống → re-validate; inventory OOS set lại true dưới
            } else if (result.outcome() == Outcome.PRODUCT_MISSING) {
                unavailable = true; // draft/deleted/slug đổi — giữ snapshot, không xóa
            } else if (unitPrice == 0) {
                // CATALOG_DOWN + chưa bao giờ có giá (add lúc catalog chết) →
                // chưa xác thực được availability, không tính vào subtotal.
                unavailable = true;
            }
            // CATALOG_DOWN + có snapshot giá → giữ snapshot + trạng thái cũ
        } else if (unitPrice == 0) {
            // Không slug + không giá (add qua API không hint khi catalog chết)
            unavailable = true;
        }

        if (item.variantId() != null && !unavailable) {
            Integer available = availability.get(item.variantId().toString());
            if (available != null && available <= 0) {
                unavailable = true; // variant hết hàng (§6.1.2)
            }
        }
        return new LineItem(item.id(), item.productId(), item.variantId(), item.qty(),
            item.slug(), name, image, unitPrice, unavailable);
    }

    // ── Mutations ──────────────────────────────────────────────────────────

    public record AddOutcome(CartDocument doc, boolean productMissing) {
    }

    /**
     * Thêm line (dedupe sameLine → cộng qty). Trả doc ĐÃ enrich + cờ product
     * missing (caller reject 404 — signature riêng để service không ném giữa
     * enrich batch).
     */
    public AddOutcome addLine(CartDocument doc, UUID productId, UUID variantId, int qty,
                              boolean allowOos, String slug) {
        // 1. Enrich item MỚI trước khi dedupe — catalog 404 → reject (contract 404)
        LineItem probe = new LineItem(UUID.randomUUID(), productId, variantId, qty, slug,
            null, null, 0, false);
        Result result = slug != null && !slug.isBlank()
            ? catalog.fetchBySlug(slug)
            : new Result(Outcome.CATALOG_DOWN, null); // không slug → không tra được, coi như down

        if (result.outcome() == Outcome.PRODUCT_MISSING) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                "product_not_found — product/variant không tồn tại hoặc đã gỡ");
        }

        LineItem line = probe;
        if (result.outcome() == Outcome.OK) {
            ProductView product = result.product();
            long unitPrice = product.price() + product.priceDeltaOf(variantId).orElse(0L);
            line = new LineItem(probe.id(), productId, variantId, qty, slug,
                product.name(),
                product.image() != null ? product.image().url() : null,
                unitPrice, false);
        } // CATALOG_DOWN → line giữ unitPrice 0 + unavailable=true (enrichOne sau)

        // 2. Stock check theo VARIANT (§6.1.4) — 409 khi thiếu & !allowOos
        if (variantId != null) {
            Integer available = inventory
                .availabilityOf(List.of(variantId))
                .get(variantId.toString());
            if (available != null && available < qty && !allowOos) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "out_of_stock — variant " + variantId + " chỉ còn " + available);
            }
            if (available != null && available <= 0) {
                line = withUnavailable(line, true);
            }
        }

        // 3. Dedupe line identity — cộng qty (cap 99); line cũ GIỮ id (client
        // đang giữ id cho PATCH/DELETE). code-review P1: catalog DOWN → probe
        // thoái hóa (name null/price 0) KHÔNG được đè snapshot lành của line
        // cũ — chỉ catalog OK (dữ liệu live) mới thay enrichment.
        List<LineItem> items = new ArrayList<>(doc.items());
        int index = indexOfSameLine(items, line);
        if (index >= 0) {
            LineItem existing = items.get(index);
            int mergedQty = Math.min(MAX_QTY_PER_LINE, existing.qty() + qty);
            if (result.outcome() == Outcome.OK) {
                items.set(index, new LineItem(existing.id(), existing.productId(), existing.variantId(),
                    mergedQty, line.slug(), line.name(), line.image(), line.unitPrice(), line.unavailable()));
            } else {
                items.set(index, existing.withQty(mergedQty));
            }
        } else {
            items.add(line);
        }
        CartDocument updated = doc.withItems(items);
        return new AddOutcome(enrichAll(updated), false);
    }

    /** PATCH qty — 404 line lạ; 409 vượt stock (variant). qty clamp 99 TRƯỚC
     *  khi so stock (code-review P2: qty 150 không bị 409 oan khi stock 120). */
    public CartDocument patchQty(CartDocument doc, UUID lineId, int qty) {
        List<LineItem> items = new ArrayList<>(doc.items());
        int index = indexOfLineId(items, lineId);
        if (index < 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "item_not_found — " + lineId);
        }
        int clamped = Math.min(MAX_QTY_PER_LINE, qty);
        LineItem line = items.get(index).withQty(clamped);
        if (line.variantId() != null) {
            Integer available = inventory
                .availabilityOf(List.of(line.variantId()))
                .get(line.variantId().toString());
            if (available != null && available < clamped) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "qty_exceeds_stock — variant " + line.variantId() + " chỉ còn " + available);
            }
        }
        items.set(index, line);
        return enrichAll(doc.withItems(items));
    }

    /** DELETE line — trả doc sau xóa (200, KHÔNG 204 — contract). */
    public CartDocument removeLine(CartDocument doc, UUID lineId) {
        List<LineItem> items = new ArrayList<>(doc.items());
        int index = indexOfLineId(items, lineId);
        if (index < 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "item_not_found — " + lineId);
        }
        items.remove(index);
        return enrichAll(doc.withItems(items));
    }

    /** Merge guest → user: dedupe line identity cộng qty, enrich lại, xóa giỏ guest. */
    public CartDocument merge(CartDocument userDoc, CartDocument guestDoc) {
        List<LineItem> items = new ArrayList<>(userDoc.items());
        for (LineItem guestLine : guestDoc.items()) {
            int index = indexOfSameLine(items, guestLine);
            if (index >= 0) {
                LineItem existing = items.get(index);
                items.set(index, existing.withQty(
                    Math.min(MAX_QTY_PER_LINE, existing.qty() + guestLine.qty())));
            } else {
                items.add(guestLine);
            }
        }
        return enrichAll(userDoc.withItems(items));
    }

    // ── Response mapping ───────────────────────────────────────────────────

    /** Subtotal = Σ lineTotal CHỈ item khả dụng (contract cart.yaml). */
    public CartResponse toResponse(CartDocument doc, String guestToken) {
        List<CartItemResponse> items = doc.items().stream()
            .map(item -> new CartItemResponse(
                item.id().toString(), item.productId(), item.variantId(), item.slug(),
                item.name(), item.image(), item.qty(), item.unitPrice(),
                item.lineTotal(), item.unavailable()))
            .toList();
        long subtotal = doc.items().stream()
            .filter(item -> !item.unavailable())
            .mapToLong(LineItem::lineTotal)
            .sum();
        return new CartResponse(guestToken, items, subtotal);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private int indexOfSameLine(List<LineItem> items, LineItem target) {
        for (int i = 0; i < items.size(); i++) {
            if (items.get(i).sameLine(target)) {
                return i;
            }
        }
        return -1;
    }

    private int indexOfLineId(List<LineItem> items, UUID lineId) {
        for (int i = 0; i < items.size(); i++) {
            if (items.get(i).id().equals(lineId)) {
                return i;
            }
        }
        return -1;
    }

    private LineItem withUnavailable(LineItem item, boolean unavailable) {
        return new LineItem(item.id(), item.productId(), item.variantId(), item.qty(),
            item.slug(), item.name(), item.image(), item.unitPrice(), unavailable);
    }
}
