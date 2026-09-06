package com.ecommerce.identity.user;

import com.ecommerce.identity.auth.MeResponse;
import com.ecommerce.identity.auth.UpdateMeRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/** GET/PATCH /me — bearer JWT (sub = user id). PATCH là GAP endpoint FI-310. */
@RestController
public class MeController {

    private final UserRepository userRepository;

    public MeController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return userRepository.findById(UUID.fromString(jwt.getSubject()))
            .map(MeController::toMe)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    /** GAP endpoint (REQUIREMENT-GAP FI-310) — amendment đề xuất PATCH /me + Me.phone. */
    @PatchMapping("/me")
    public MeResponse updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateMeRequest request) {
        UserEntity user = userRepository.findById(UUID.fromString(jwt.getSubject()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (request.fullName() != null) user.setFullName(request.fullName().trim());
        if (request.phone() != null) user.setPhone(request.phone().isBlank() ? null : request.phone().trim());
        return toMe(userRepository.save(user));
    }

    static MeResponse toMe(UserEntity user) {
        return new MeResponse(user.getId(), user.getEmail(), user.getFullName(), user.getPhone(),
            List.of(user.getRole().name()), false);
    }
}
