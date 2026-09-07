package com.ecommerce.affiliate.loyalty;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Internal loyalty redeem (D22) — path FROZEN affiliate.yaml
 * {@code POST /api/affiliate/internal/loyalty/redeem}, x-internal-only:
 * ordering-service gọi service-to-service (KHÔNG qua gateway — gateway block
 * route này, quyết định spec D8). Contract security: [] → Spring Security
 * permitAll; auth là shared-secret header X-Internal-Token.
 */
@RestController
@RequestMapping("/api/affiliate/internal/loyalty")
public class InternalLoyaltyController {

    private static final Logger log = LoggerFactory.getLogger(InternalLoyaltyController.class);

    private final LoyaltyService loyaltyService;
    private final LoyaltyProperties props;

    public InternalLoyaltyController(LoyaltyService loyaltyService, LoyaltyProperties props) {
        this.loyaltyService = loyaltyService;
        this.props = props;
    }

    /**
     * POST /redeem — trừ điểm, trả discount VND (points × pointVnd) + remaining.
     * 400 points ≤ 0 · 409 điểm không đủ / đơn đã redeem (contract RedeemResult).
     */
    @PostMapping("/redeem")
    public RedeemResponse redeem(
        @RequestHeader(value = "X-Internal-Token", required = false) String token,
        @Valid @RequestBody RedeemRequest request) {
        requireInternalToken(token);
        LoyaltyService.RedeemResult result =
            loyaltyService.redeem(request.userId(), request.points(), request.orderId());
        return new RedeemResponse(result.discount(), result.remaining());
    }

    private void requireInternalToken(String token) {
        if (token == null || !token.equals(props.internalToken())) {
            log.warn("Internal redeem sai X-Internal-Token — từ chối");
            throw new InternalTokenException("Internal token không hợp lệ");
        }
    }

    public record RedeemRequest(
        @NotNull UUID userId,
        @NotNull @Positive long points,
        @NotBlank String orderId
    ) {
    }

    public record RedeemResponse(long discount, long remaining) {
    }

    /** Sai token → 403 (không phải AuthEntryPoint — request service-to-service). */
    public static class InternalTokenException extends RuntimeException {
        public InternalTokenException(String message) {
            super(message);
        }
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(InternalTokenException.class)
    ProblemDetail tokenRejected(InternalTokenException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage());
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(
        {LoyaltyService.InsufficientPointsException.class, LoyaltyService.DuplicateRedeemException.class})
    ProblemDetail conflict(RuntimeException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail badRequest(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
