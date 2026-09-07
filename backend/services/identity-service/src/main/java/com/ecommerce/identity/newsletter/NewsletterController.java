package com.ecommerce.identity.newsletter;

import com.ecommerce.common.outbox.OutboxWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * Newsletter subscribe (SF-13 A8) — PUBLIC POST /newsletter (gateway
 * StripPrefix=2 → /newsletter; public-paths đã thêm). Runtime endpoint NGOÀI
 * identity.yaml freeze (ADR 0005). Dup email → 204-no-op "already" — KHÔNG
 * row mới, KHÔNG event (ACCEPTANCE: email trùng không double).
 */
@RestController
@RequestMapping("/newsletter")
public class NewsletterController {

    public record SubscribeRequest(@NotBlank @Email String email) {
    }

    public record SubscribeResponse(String status) {
    }

    private final NewsletterRepository subscriptions;
    private final OutboxWriter outboxWriter;
    private final ObjectMapper objectMapper;

    public NewsletterController(NewsletterRepository subscriptions, OutboxWriter outboxWriter,
                                ObjectMapper objectMapper) {
        this.subscriptions = subscriptions;
        this.outboxWriter = outboxWriter;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<SubscribeResponse> subscribe(@Valid @RequestBody SubscribeRequest request) {
        String email = request.email().trim().toLowerCase();
        if (subscriptions.findByEmail(email).isPresent()) {
            return ResponseEntity.ok(new SubscribeResponse("already"));
        }
        NewsletterSubscriptionEntity entity = new NewsletterSubscriptionEntity();
        entity.setEmail(email);
        subscriptions.save(entity);
        // RACE dup đồng thời: unique email nổ DataIntegrityViolation → common-lib
        // map 409 (FE hiện "already") — ACCEPTANCE là không double EMAIL.
        outboxWriter.write("user.newsletter_subscribed",
            objectMapper.valueToTree(Map.of("email", email, "subscribedAt", Instant.now().toString())),
            "newsletter:" + email);
        return ResponseEntity.ok(new SubscribeResponse("subscribed"));
    }
}
