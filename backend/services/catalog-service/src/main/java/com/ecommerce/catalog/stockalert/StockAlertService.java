package com.ecommerce.catalog.stockalert;

import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ProductVariantEntity;
import com.ecommerce.catalog.inventory.InventoryAvailabilityClient;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ProductVariantRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Stock alert (SF-15, D22): register công khai (hết hàng mới nhận) +
 * candidates/claim nội bộ cho notification restock-mailer (claim atomic =
 * email đúng 1 lần).
 */
@Service
public class StockAlertService {

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final int MAX_CANDIDATE_VARIANTS = 100; // cap batch availability
    private static final String DEFAULT_TOKEN = "dev-internal-token";

    private final StockAlertRepository alertRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryAvailabilityClient inventory;
    private final String internalToken;
    private final org.springframework.core.env.Environment environment;

    public StockAlertService(StockAlertRepository alertRepository, ProductRepository productRepository,
                             ProductVariantRepository variantRepository, InventoryAvailabilityClient inventory,
                             @Value("${catalog.internal-token:dev-internal-token}") String internalToken,
                             org.springframework.core.env.Environment environment) {
        this.alertRepository = alertRepository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.inventory = inventory;
        this.internalToken = internalToken;
        this.environment = environment;
    }

    public record RegisterRequest(String email, UUID variantId) {}

    /** Đăng ký nhận — idempotent (đã ACTIVE cùng email+variant → vẫn 202). */
    @Transactional
    public void register(String slug, String email, UUID variantId) {
        if (email == null || !EMAIL.matcher(email.trim()).matches()) {
            throw bad("Email không hợp lệ");
        }
        String normalized = email.trim().toLowerCase();
        ProductEntity product = productRepository.findBySlugViOrSlugEn(slug, slug)
            .filter(p -> p.getStatus() == ProductStatus.PUBLISHED && p.getDeletedAt() == null)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy sản phẩm"));
        ProductVariantEntity variant = variantRepository.findById(variantId)
            .filter(v -> v.getProductId().equals(product.getId()))
            .orElseThrow(() -> bad("Biến thể không thuộc sản phẩm này"));
        // Chỉ nhận đăng ký khi đang hết hàng (client ẩn form khi còn hàng —
        // guard này chống bypass: còn hàng thì không có gì để "nhắn").
        Map<UUID, Integer> availability = inventory.availability(java.util.Set.of(variant.getId()));
        Integer available = availability.get(variant.getId());
        if (available != null && available > 0) {
            throw bad("Sản phẩm đang còn hàng");
        }
        if (!alertRepository.existsByUserEmailAndVariantIdAndStatus(
            normalized, variant.getId(), StockAlertEntity.STATUS_ACTIVE)) {
            StockAlertEntity alert = new StockAlertEntity();
            alert.setUserEmail(normalized);
            alert.setProductId(product.getId());
            alert.setVariantId(variant.getId());
            alertRepository.save(alert);
        }
    }

    public record Candidate(UUID alertId, String email, UUID productId, String slug,
                            String productName, String variantName) {}

    /** ACTIVE alerts của variant vừa có hàng (availability > 0) — chưa flip. */
    @Transactional(readOnly = true)
    public List<Candidate> candidates(int limit) {
        // query-level cap (P2): không load cả bảng ACTIVE khi phình to
        List<StockAlertEntity> active = alertRepository.findByStatus(
            StockAlertEntity.STATUS_ACTIVE, org.springframework.data.domain.PageRequest.of(0, 500));
        if (active.isEmpty()) return List.of();
        List<UUID> variantIds = active.stream().map(StockAlertEntity::getVariantId).distinct()
            .limit(MAX_CANDIDATE_VARIANTS)
            .toList();
        Map<UUID, Integer> availability = inventory.availability(variantIds);
        List<StockAlertEntity> restocked = active.stream()
            .filter(a -> availability.getOrDefault(a.getVariantId(), 0) > 0)
            .limit(Math.max(1, limit))
            .toList();
        return hydrate(restocked);
    }

    /**
     * Claim atomic: flip ACTIVE→NOTIFIED, trả các row đã flip (lần claim sau
     * trên cùng ids → rỗng). notification gửi mail cho phần nó thắng claim.
     */
    @Transactional
    public List<Candidate> claim(List<UUID> ids, String token) {
        requireToken(token);
        if (ids == null || ids.isEmpty()) return List.of();
        Instant now = Instant.now();
        alertRepository.claimAll(ids, now);
        List<StockAlertEntity> flipped = alertRepository.findByIdInAndStatusAndNotifiedAt(
            ids, StockAlertEntity.STATUS_NOTIFIED, now);
        return hydrate(flipped);
    }

    /** X-Internal-Token service-to-service — /api/catalog/** public ở gateway
     * nên internal endpoint bắt buộc tự giữ của riêng mình (spec §4.3).
     * Prod thiếu token/giữ default → fail-fast (code-review P1); so sánh
     * constant-time (MessageDigest.isEqual). */
    void requireToken(String token) {
        if (internalToken == null || internalToken.isBlank() || DEFAULT_TOKEN.equals(internalToken)) {
            for (String profile : environment.getActiveProfiles()) {
                if (profile.contains("prod")) {
                    throw new IllegalStateException(
                        "CATALOG_INTERNAL_TOKEN bắt buộc set (khác default) ở profile prod");
                }
            }
        }
        if (token == null || internalToken == null
            || !MessageDigest.isEqual(
                internalToken.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Internal token không hợp lệ");
        }
    }

    private List<Candidate> hydrate(List<StockAlertEntity> alerts) {
        if (alerts.isEmpty()) return List.of();
        Map<UUID, ProductEntity> products = productRepository.findAllById(
                alerts.stream().map(StockAlertEntity::getProductId).distinct().toList()).stream()
            .collect(Collectors.toMap(ProductEntity::getId, Function.identity()));
        Map<UUID, ProductVariantEntity> variants = variantRepository.findAllById(
                alerts.stream().map(StockAlertEntity::getVariantId).distinct().toList()).stream()
            .collect(Collectors.toMap(ProductVariantEntity::getId, Function.identity()));
        List<Candidate> out = new ArrayList<>(alerts.size());
        for (StockAlertEntity alert : alerts) {
            ProductEntity product = products.get(alert.getProductId());
            if (product == null) continue;
            ProductVariantEntity variant = variants.get(alert.getVariantId());
            out.add(new Candidate(
                alert.getId(),
                alert.getUserEmail(),
                product.getId(),
                product.getSlugVi(),
                product.getName().resolve("vi"),
                variantName(variant)));
        }
        return out;
    }

    private String variantName(ProductVariantEntity variant) {
        if (variant == null) return "";
        I18nText name = variant.getNameI18n();
        if (name != null) return name.resolve("vi");
        String size = variant.getSize() == null ? "" : variant.getSize();
        String color = variant.getColor() == null ? "" : variant.getColor();
        return (color + " " + size).trim();
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
