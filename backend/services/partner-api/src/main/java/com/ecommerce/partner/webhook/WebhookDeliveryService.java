package com.ecommerce.partner.webhook;

import com.ecommerce.partner.config.PartnerProperties;
import com.ecommerce.partner.domain.DeliveryStatus;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.domain.WebhookDeliveryEntity;
import com.ecommerce.partner.repo.PartnerRepository;
import com.ecommerce.partner.repo.WebhookDeliveryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Push webhook ra partner + retry exponential → DLQ bảng (ADR-11b).
 *
 * <p>Một delivery = 1 row: POST raw payload (giữ NGUYÊN từ lúc tạo — signature
 * không đổi giữa các attempt) + header {@code X-Signature} (hex lowercase).
 * 2xx → DELIVERED; lỗi → attempts+1, quá {@code max-attempts} (3) → DEAD;
 * còn lại PENDING với next_retry_at = now + base*2^attempts.</p>
 *
 * <p>Scheduler quét PENDING đến hạn (mặc định 5s; IT 200ms). webhook_url là
 * URL do partner khai — MVP dev không whitelist (SSRF risk được chấp nhận
 * trong scope demo; production cần allowlist — ghi docs).</p>
 */
@Service
public class WebhookDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(WebhookDeliveryService.class);

    private final WebhookDeliveryRepository deliveries;
    private final PartnerRepository partners;
    private final RestClient rest;
    private final long retryBaseMs;
    private final int maxAttempts;

    public WebhookDeliveryService(WebhookDeliveryRepository deliveries,
                                  PartnerRepository partners,
                                  RestClient.Builder builder,
                                  PartnerProperties props) {
        this.deliveries = deliveries;
        this.partners = partners;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        this.rest = builder.requestFactory(factory).build();
        this.retryBaseMs = props.webhook().retryBaseMs();
        this.maxAttempts = props.webhook().maxAttempts();
    }

    /** Attempt 1 delivery — trả delivery_status mới. */
    public DeliveryStatus attempt(WebhookDeliveryEntity delivery) {
        PartnerEntity partner = partners.findById(delivery.getPartnerId()).orElse(null);
        if (partner == null || partner.getWebhookUrl() == null || partner.getWebhookUrl().isBlank()) {
            // partner bị xoá/hủy webhook giữa chừng — DEAD (không còn đích)
            delivery.setDeliveryStatus(DeliveryStatus.DEAD);
            delivery.setLastError("partner không tồn tại hoặc không có webhook_url");
            deliveries.save(delivery);
            return DeliveryStatus.DEAD;
        }
        String signature = HmacSigner.sign(partner.getWebhookSecret(), delivery.getPayload());
        try {
            rest.post()
                .uri(partner.getWebhookUrl())
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header("X-Signature", signature)
                .body(delivery.getPayload())
                .retrieve()
                .toBodilessEntity();
            delivery.setDeliveryStatus(DeliveryStatus.DELIVERED);
            delivery.setDeliveredAt(Instant.now());
            deliveries.save(delivery);
            log.info("[webhook] {} → {} DELIVERED (attempt {})",
                delivery.getEventId(), partner.getWebhookUrl(), delivery.getAttempts() + 1);
            return DeliveryStatus.DELIVERED;
        } catch (Exception e) {
            int attempt = delivery.getAttempts() + 1;
            delivery.setAttempts(attempt);
            delivery.setLastError(truncate(e.getMessage()));
            if (attempt >= maxAttempts) {
                delivery.setDeliveryStatus(DeliveryStatus.DEAD);
                log.warn("[webhook] {} → DEAD sau {} attempts: {}",
                    delivery.getEventId(), attempt, e.getMessage());
            } else {
                long delay = retryBaseMs * (1L << attempt); // base * 2^attempt
                delivery.setNextRetryAt(Instant.now().plusMillis(delay));
                log.info("[webhook] {} attempt {} fail — retry sau {}ms: {}",
                    delivery.getEventId(), attempt, delay, e.getMessage());
            }
            deliveries.save(delivery);
            return delivery.getDeliveryStatus();
        }
    }

    /** Quét PENDING đến hạn — scheduler (fixedDelay; 1 instance MVP). */
    @Scheduled(fixedDelayString = "${partner.webhook.scheduler-interval-ms:5000}")
    public void retryPendingDue() {
        List<WebhookDeliveryEntity> due =
            deliveries.findByDeliveryStatusAndNextRetryAtLessThanEqual(DeliveryStatus.PENDING, Instant.now());
        for (WebhookDeliveryEntity delivery : due) {
            attempt(delivery);
        }
    }

    private static String truncate(String message) {
        if (message == null) {
            return "lỗi không xác định";
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }
}
