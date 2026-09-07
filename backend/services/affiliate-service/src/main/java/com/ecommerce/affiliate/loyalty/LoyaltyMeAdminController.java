package com.ecommerce.affiliate.loyalty;

import com.ecommerce.affiliate.loyalty.domain.LoyaltyAccount;
import com.ecommerce.affiliate.loyalty.domain.LoyaltyLedgerEntry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Loyalty endpoints ADDITIVE (không nằm trong affiliate.yaml frozen — cùng
 * precedent SF-12 suspend/reactivate; gap FI-310). User tra cứu điểm của mình,
 * admin tra cứu theo userId + adjust thủ công (pack: "Admin chỉnh điểm").
 */
@RestController
@RequestMapping("/api/affiliate")
public class LoyaltyMeAdminController {

    private final LoyaltyService loyaltyService;

    public LoyaltyMeAdminController(LoyaltyService loyaltyService) {
        this.loyaltyService = loyaltyService;
    }

    // ── customer (JWT bất kỳ) ───────────────────────────────────────────────

    /** GET /api/affiliate/me/loyalty — balance + tổng đã nhận (account dashboard). */
    @GetMapping("/me/loyalty")
    public LoyaltyAccountResponse myLoyalty(@AuthenticationPrincipal Jwt jwt) {
        return toResponse(loyaltyService.accountOf(currentUserId(jwt)));
    }

    /** GET /api/affiliate/me/loyalty/ledger — sổ điểm của tôi (page 1-based). */
    @GetMapping("/me/loyalty/ledger")
    public LedgerPage myLedger(@AuthenticationPrincipal Jwt jwt,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "20") int size) {
        Page<LoyaltyLedgerEntry> result = loyaltyService.ledgerOf(currentUserId(jwt), page, size);
        return new LedgerPage(result.getContent().stream().map(LoyaltyMeAdminController::toEntry).toList(),
            result.getNumber() + 1, result.getSize(), result.getTotalElements());
    }

    // ── admin (2 lớp: gateway admin-prefix + @PreAuthorize) ────────────────

    /** GET /api/affiliate/admin/loyalty?userId= — tra cứu account + ledger gần đây. */
    @GetMapping("/admin/loyalty")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminLoyaltyResponse adminLookup(@RequestParam UUID userId,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "10") int size) {
        LoyaltyAccountResponse account = toResponse(loyaltyService.accountOf(userId));
        Page<LoyaltyLedgerEntry> ledger = loyaltyService.ledgerOf(userId, page, size);
        return new AdminLoyaltyResponse(account, ledger.getContent().stream()
            .map(LoyaltyMeAdminController::toEntry).toList(),
            ledger.getNumber() + 1, ledger.getSize(), ledger.getTotalElements());
    }

    /** POST /api/affiliate/admin/loyalty/adjust — chỉnh điểm tay (delta ±, note). */
    @PostMapping("/admin/loyalty/adjust")
    @PreAuthorize("hasRole('ADMIN')")
    public LoyaltyAccountResponse adjust(@Valid @RequestBody AdjustRequest request) {
        long balance = loyaltyService.adjust(request.userId(), request.points(), request.note());
        return new LoyaltyAccountResponse(request.userId(), balance,
            loyaltyService.accountOf(request.userId()).getTotalEarned());
    }

    // ── helpers + DTOs ──────────────────────────────────────────────────────

    private static UUID currentUserId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    private static LoyaltyAccountResponse toResponse(LoyaltyAccount account) {
        return new LoyaltyAccountResponse(account.getUserId(), account.getBalance(),
            account.getTotalEarned());
    }

    private static LedgerEntryResponse toEntry(LoyaltyLedgerEntry entry) {
        return new LedgerEntryResponse(entry.getId().toString(), entry.getOrderId(),
            entry.getType().name(), entry.getPoints(), entry.getNote(),
            entry.getCreatedAt().toString());
    }

    public record LoyaltyAccountResponse(UUID userId, long balance, long totalEarned) {
    }

    public record LedgerEntryResponse(String id, String orderId, String type, long points,
                                      String note, String createdAt) {
    }

    public record LedgerPage(List<LedgerEntryResponse> items, int page, int size, long total) {
    }

    public record AdminLoyaltyResponse(LoyaltyAccountResponse account, List<LedgerEntryResponse> ledger,
                                       int page, int size, long total) {
    }

    public record AdjustRequest(@NotNull UUID userId, long points, String note) {
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail badAdjust(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
