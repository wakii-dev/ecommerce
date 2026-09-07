package com.ecommerce.identity.auth;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Password forgot/reset (SF-13 A1) — PUBLIC theo contract identity.yaml D21:
 * {@code POST /api/identity/password/forgot} → luôn 202 (anti-enumeration);
 * {@code POST /api/identity/password/reset} → 204, token sai/hết hạn 401.
 * Gateway StripPrefix=2 → controller map {@code /password/**}.
 */
@RestController
@RequestMapping("/password")
public class PasswordResetController {

    /** Body cố định — forgot trả giống hệt cho email có/không tồn tại. */
    public record AcceptedResponse(String status) {}

    private final PasswordResetService service;

    public PasswordResetController(PasswordResetService service) {
        this.service = service;
    }

    @PostMapping("/forgot")
    public ResponseEntity<AcceptedResponse> forgot(
        @Valid @RequestBody ForgotPasswordRequest request,
        @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        service.forgot(request.email(), requestId);
        return ResponseEntity.accepted().body(new AcceptedResponse("accepted"));
    }

    @PostMapping("/reset")
    public ResponseEntity<Void> reset(@Valid @RequestBody ResetPasswordRequest request) {
        service.reset(request.token(), request.newPassword());
        return ResponseEntity.noContent().build();
    }
}
