package com.ecommerce.notification.mail;

import com.ecommerce.notification.config.NotifyProperties;
import com.ecommerce.notification.identity.IdentityClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lấy bytes PDF hóa đơn từ ordering (D18): GET nội bộ
 * {@code /admin/orders/{id}/invoice} (ordering.yaml) bằng service-token ADMIN.
 * Order phải CONFIRMED+ — event order.confirmed phát SAU khi status commit nên
 * không có race. Filename lấy từ Content-Disposition của ordering
 * ({@code invoice-<soHoaDon>.pdf}) — fallback {@code invoice-<orderId>.pdf}.
 *
 * <p>Lỗi KHÔNG chặn email cảm ơn (caller bắt): 403 = service-account chưa có
 * role ADMIN (chạy {@code make seed} — seed gán role), 409/404/5xx = hóa đơn
 * chưa dựng được — email vẫn gửi, chỉ thiếu file đính kèm.</p>
 */
@Component
public class InvoiceClient {

    private static final Logger log = LoggerFactory.getLogger(InvoiceClient.class);
    private static final Pattern FILENAME = Pattern.compile("filename=\"?([^\";]+)\"?");

    private final RestClient rest;
    private final IdentityClient identity;

    public InvoiceClient(RestClient.Builder builder, NotifyProperties props, IdentityClient identity) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) props.ordering().timeoutMs());
        factory.setReadTimeout((int) props.ordering().timeoutMs());
        this.rest = builder.requestFactory(factory)
            .baseUrl(props.ordering().baseUrl())
            .build();
        this.identity = identity;
    }

    /** PDF bytes + tên file. Empty khi lỗi (đã log) — email vẫn gửi không attach. */
    public Optional<Attachment> fetchInvoicePdf(String orderId) {
        String token = identity.getAccessToken();
        try {
            var entity = rest.get()
                .uri("/admin/orders/{id}/invoice", orderId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .toEntity(byte[].class);
            byte[] body = entity.getBody();
            if (body == null || body.length == 0) {
                log.warn("[invoice] {} trả body rỗng — email gửi không đính kèm", orderId);
                return Optional.empty();
            }
            String name = contentDispositionFilename(
                entity.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION), orderId);
            return Optional.of(new Attachment(name, body));
        } catch (HttpClientErrorException.Forbidden e) {
            log.warn("[invoice] 403 — service-account chưa có role ADMIN (chạy `make seed` "
                + "hoặc gán role tay). Email gửi KHÔNG đính kèm PDF. orderId={}", orderId);
            return Optional.empty();
        } catch (Exception e) {
            log.warn("[invoice] lấy PDF lỗi cho {}: {} — email gửi không đính kèm",
                orderId, e.toString());
            return Optional.empty();
        }
    }

    private String contentDispositionFilename(String header, String orderId) {
        if (header != null) {
            Matcher matcher = FILENAME.matcher(header);
            if (matcher.find() && matcher.group(1) != null) {
                return matcher.group(1);
            }
        }
        return "invoice-" + orderId + ".pdf";
    }

    public record Attachment(String filename, byte[] pdf) {
    }
}
