package com.ecommerce.affiliate.service;

import com.ecommerce.affiliate.api.dto.AffiliateDtos.AffiliatePendingResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.AffiliateProfileResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.LedgerEntryResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.PageResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.StatsResponse;
import com.ecommerce.affiliate.config.AffiliateProperties;
import com.ecommerce.affiliate.domain.Affiliate;
import com.ecommerce.affiliate.domain.AffiliateStatus;
import com.ecommerce.affiliate.domain.Click;
import com.ecommerce.affiliate.domain.LedgerEntry;
import com.ecommerce.affiliate.repo.AffiliateRepository;
import com.ecommerce.affiliate.repo.ClickRepository;
import com.ecommerce.affiliate.repo.LedgerRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Nghiệp vụ affiliate (SF-12): đăng ký → duyệt → ref code → track click →
 * stats/ledger. Conflict (409) ném {@link ResponseStatusException} — map
 * problem+json qua GlobalExceptionHandler của common-lib.
 */
@Service
public class AffiliateService {

    private static final int MAX_CODE_ATTEMPTS = 5;
    private static final int DEFAULT_PAGE_SIZE = 20;

    private final AffiliateRepository affiliates;
    private final ClickRepository clicks;
    private final LedgerRepository ledger;
    private final RefCodeGenerator codeGenerator;
    private final LedgerService ledgerService;
    private final AffiliateProperties props;

    public AffiliateService(AffiliateRepository affiliates, ClickRepository clicks,
                            LedgerRepository ledger, RefCodeGenerator codeGenerator,
                            LedgerService ledgerService, AffiliateProperties props) {
        this.affiliates = affiliates;
        this.clicks = clicks;
        this.ledger = ledger;
        this.codeGenerator = codeGenerator;
        this.ledgerService = ledgerService;
        this.props = props;
    }

    // ── affiliate tự thao tác ───────────────────────────────────────────────

    /** Đăng ký (JWT) → 202 PENDING. REJECTED → đăng ký lại được (reset PENDING). */
    @Transactional
    public AffiliatePendingResponse register(UUID userId, String portfolioUrl, String note) {
        Affiliate existing = affiliates.findByUserId(userId).orElse(null);
        if (existing == null) {
            Affiliate created = new Affiliate(userId, portfolioUrl, note);
            return toPending(affiliates.save(created));
        }
        if (existing.getStatus() == AffiliateStatus.REJECTED) {
            existing.resubmit(portfolioUrl, note);
            return toPending(affiliates.save(existing));
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "User đã có hồ sơ affiliate");
    }

    /** Hồ sơ của user hiện tại (contract /me) — 404 khi chưa đăng ký. */
    @Transactional(readOnly = true)
    public AffiliateProfileResponse me(UUID userId) {
        Affiliate affiliate = findByUserOr404(userId);
        return toProfile(affiliate);
    }

    /** Sổ hoa hồng của user hiện tại (contract /me/ledger) — page 1-based. */
    @Transactional(readOnly = true)
    public PageResponse<LedgerEntryResponse> myLedger(UUID userId, int page, int size) {
        Affiliate affiliate = findByUserOr404(userId);
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), normalizedSize(size));
        Page<LedgerEntry> entries = ledger.findByAffiliateIdOrderByCreatedAtDesc(affiliate.getId(), pageable);
        List<LedgerEntryResponse> items = entries.getContent().stream().map(AffiliateService::toLedgerEntry).toList();
        return new PageResponse<>(items, entries.getNumber() + 1, entries.getSize(), entries.getTotalElements());
    }

    // ── track click (public — storefront gọi) ───────────────────────────────

    /**
     * Capture click {@code ?ref=<code>} — contract: 204 LUÔN (kể cả code sai —
     * im lặng tránh lộ trạng thái). Code APPROVED → record click (dedupe
     * code+ip/{@code clickDedupeMinutes}) + trả cookie để caller set (null =
     * không set cookie).
     */
    @Transactional
    public ClickCaptureResult trackClick(String refCode, String ip, String userAgent) {
        Affiliate affiliate = affiliates.findByCode(refCode).orElse(null);
        if (affiliate == null || !affiliate.isApproved()) {
            return new ClickCaptureResult(null);   // sai / không ACTIVE → không cookie, không lỗi
        }
        String ipHash = sha256(props.getHashSalt() + ip);
        String uaHash = userAgent == null || userAgent.isBlank()
            ? null
            : sha256(props.getHashSalt() + userAgent);
        Instant windowStart = Instant.now().minus(Duration.ofMinutes(props.getClickDedupeMinutes()));
        long recent = clicks.countByCodeAndIpHashAndOccurredAtAfter(refCode, ipHash, windowStart);
        if (recent == 0) {
            clicks.save(new Click(refCode, affiliate.getId(), ipHash, uaHash));
        }
        return new ClickCaptureResult(refCode);
    }

    /** Cookie cho track click — record đã ghi, chỉ còn set attribution. */
    public record ClickCaptureResult(String cookieValue) {
    }

    // ── admin ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<AffiliateProfileResponse> listAdmin(AffiliateStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), normalizedSize(size));
        Page<Affiliate> profiles = status == null
            ? affiliates.findAll(pageable)
            : affiliates.findByStatus(status, pageable);
        List<AffiliateProfileResponse> items = profiles.getContent().stream().map(this::toProfile).toList();
        return new PageResponse<>(items, profiles.getNumber() + 1, profiles.getSize(), profiles.getTotalElements());
    }

    @Transactional
    public AffiliateProfileResponse approve(UUID id) {
        Affiliate affiliate = getByIdOr404(id);
        try {
            affiliate.approve(generateUniqueCode(), props.getDefaultRate());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
        return toProfile(affiliates.save(affiliate));
    }

    @Transactional
    public AffiliateProfileResponse reject(UUID id) {
        Affiliate affiliate = getByIdOr404(id);
        try {
            affiliate.reject();
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
        return toProfile(affiliates.save(affiliate));
    }

    /** Additive (acceptance pack): APPROVED→SUSPENDED — link ngừng track. */
    @Transactional
    public AffiliateProfileResponse suspend(UUID id) {
        Affiliate affiliate = getByIdOr404(id);
        try {
            affiliate.suspend();
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
        return toProfile(affiliates.save(affiliate));
    }

    /** Additive: SUSPENDED→APPROVED — track hoạt động lại với code cũ. */
    @Transactional
    public AffiliateProfileResponse reactivate(UUID id) {
        Affiliate affiliate = getByIdOr404(id);
        try {
            affiliate.reactivate();
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
        return toProfile(affiliates.save(affiliate));
    }

    /** Đổi rate — đơn SAU dùng rate mới; ledger cũ giữ rate cũ (contract). */
    @Transactional
    public AffiliateProfileResponse updateRate(UUID id, BigDecimal rate) {
        Affiliate affiliate = getByIdOr404(id);
        affiliate.changeRate(rate);   // rate validate ở DTO (@DecimalMin/Max)
        return toProfile(affiliates.save(affiliate));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private Affiliate findByUserOr404(UUID userId) {
        return affiliates.findByUserId(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chưa đăng ký affiliate"));
    }

    private Affiliate getByIdOr404(UUID id) {
        return affiliates.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hồ sơ affiliate không tồn tại"));
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            String candidate = codeGenerator.generate();
            if (affiliates.findByCode(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new IllegalStateException("Không sinh được code unique sau " + MAX_CODE_ATTEMPTS + " lần");
    }

    private AffiliatePendingResponse toPending(Affiliate affiliate) {
        return new AffiliatePendingResponse(affiliate.getId().toString(), affiliate.getStatus().name());
    }

    private AffiliateProfileResponse toProfile(Affiliate affiliate) {
        StatsResponse stats = ledgerService.statsOf(affiliate);
        BigDecimal rate = affiliate.effectiveRate(props.getDefaultRate());
        return new AffiliateProfileResponse(
            affiliate.getId().toString(),
            affiliate.getCode(),
            affiliate.getStatus().name(),
            rate,
            stats
        );
    }

    private static LedgerEntryResponse toLedgerEntry(LedgerEntry entry) {
        return new LedgerEntryResponse(
            entry.getId().toString(),
            entry.getOrderId(),
            entry.getOrderTotal(),
            entry.getRate(),
            entry.getCommission(),
            entry.getStatus().name(),
            entry.getCreatedAt()
        );
    }

    private static int normalizedSize(int size) {
        return size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, 100);
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 không khả dụng", e);
        }
    }
}
