package com.ecommerce.partner.seed;

import com.ecommerce.partner.auth.ApiKeyService;
import com.ecommerce.partner.domain.ApiKeyEntity;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.repo.ApiKeyRepository;
import com.ecommerce.partner.repo.PartnerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seed demo (context pack §6): partner {@code DEMO-PARTNER} + API key demo
 * (scopes đủ 3) + webhook trỏ localhost:9999. Idempotent — đã seed → skip
 * (raw key chỉ in ĐÚNG 1 LẦN lúc tạo; mất key → đọc từ log seed hoặc xoá row).
 *
 * <p>Service-account ensure (spec §6) KHÔNG nằm đây — phụ thuộc
 * IdentityClient (Task 4) để tránh dep vòng trong build (plan-critic P0).</p>
 */
@Component
@ConditionalOnProperty(name = "partner.seed.enabled", havingValue = "true", matchIfMissing = true)
public class PartnerSeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PartnerSeedRunner.class);

    public static final String DEMO_PARTNER_NAME = "DEMO-PARTNER";
    public static final String DEMO_WEBHOOK_URL = "http://localhost:9999/webhook-test";
    static final List<String> DEMO_SCOPES = List.of("catalog:read", "orders:read", "orders:write");

    private final PartnerRepository partners;
    private final ApiKeyRepository apiKeys;

    public PartnerSeedRunner(PartnerRepository partners, ApiKeyRepository apiKeys) {
        this.partners = partners;
        this.apiKeys = apiKeys;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (partners.findByName(DEMO_PARTNER_NAME).isPresent()) {
            log.info("[seed] {} đã tồn tại — skip (key KHÔNG in lại; xem log lần seed đầu)", DEMO_PARTNER_NAME);
            return;
        }

        PartnerEntity partner = new PartnerEntity();
        partner.setName(DEMO_PARTNER_NAME);
        partner.setWebhookUrl(DEMO_WEBHOOK_URL);
        partner.setWebhookSecret(ApiKeyService.generateWebhookSecret());
        partner.setRateLimitPerMin(60);
        partner = partners.save(partner);

        String rawKey = ApiKeyService.generateRawKey();
        ApiKeyEntity key = new ApiKeyEntity();
        key.setPartnerId(partner.getId());
        key.setKeyHash(ApiKeyService.sha256Hex(rawKey));
        key.setPrefix(ApiKeyService.prefixOf(rawKey));
        key.setScopes(DEMO_SCOPES);
        key.setExpiresAt(null);
        key.setRevokedAt(null);
        apiKeys.save(key);

        // Raw key + secret chỉ tồn tại ở log này (DB chỉ giữ hash) — dev/demo
        log.info("[seed] ==============================================");
        log.info("[seed] DEMO-PARTNER đã tạo — API key (in 1 LẦN): {}", rawKey);
        log.info("[seed] webhook secret (in 1 LẦN): {}", partner.getWebhookSecret());
        log.info("[seed] webhook_url: {} · rate-limit: 60/phút · scopes: {}", DEMO_WEBHOOK_URL, DEMO_SCOPES);
        log.info("[seed] ==============================================");
    }
}
