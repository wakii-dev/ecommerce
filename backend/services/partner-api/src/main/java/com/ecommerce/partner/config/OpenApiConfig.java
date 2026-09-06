package com.ecommerce.partner.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Docs portal (§3.5 spec) — springdoc tại {@code /open-api/v1/docs} (Swagger
 * UI) + {@code /open-api/v1/api-docs} (JSON). Nội dung mô tả: auth X-API-Key
 * + scopes, rate-limit, idempotency partnerRef, webhook HMAC verify code mẫu
 * (Java/Node/curl) — partner tự phục vụ không cần liên hệ platform.
 */
@Configuration
public class OpenApiConfig {

    private static final String SCHEME_NAME = "ApiKeyAuth";

    @Bean
    OpenAPI partnerOpenApi() {
        return new OpenAPI()
            .info(new Info()
                .title("Partner Open API")
                .version("1.0.0")
                .description("""
                    ## API công khai cho đối tác tích hợp (D19)

                    Xác thực bằng header **`X-API-Key`** (cấp qua platform — liên hệ admin).
                    Rate-limit **theo key** (mặc định 60 request/phút): vượt → `429` kèm header `Retry-After`.

                    ### Scopes
                    | Scope | Cho phép |
                    |---|---|
                    | `catalog:read` | GET /products, /products/{id}, /categories, /search |
                    | `orders:write` | POST /orders |
                    | `orders:read`  | GET /orders/{id} |

                    | Status | Nghĩa |
                    |---|---|
                    | `401` | Key thiếu, sai, đã revoke, hết hạn hoặc partner bị SUSPENDED |
                    | `403` | Key hợp lệ nhưng **thiếu scope** cho endpoint |
                    | `429` | Vượt rate-limit — đọc `Retry-After` (giây) rồi thử lại |
                    | `409` | Sản phẩm hết hàng **hoặc ngừng bán** |

                    ### Tạo đơn (idempotent)
                    - `partnerRef` là id đơn bên HỆ THỐNG CỦA BẠN — **unique theo partner**. Gửi lại cùng
                      `partnerRef` → trả lại đơn đã có (không bao giờ double đơn), bất kể payload.
                    - `items[].variantId` **BẮT BUỘC** — lấy từ `GET /products/{id}` (mục `variants[].id`).
                    - Đơn tạo xong ở trạng thái `PENDING` — platform xử lý thanh toán/fulfil; **PENDING quá
                      30 phút sẽ bị hệ thống tự hủy** (bạn nhận webhook `CANCELLED`).
                    - Trạng thái `SHIPPED`/`DELIVERED` hiện tra cứu bằng `GET /orders/{id}`.

                    ### Webhook (OUTBOUND — platform push sang bạn)
                    Khi đơn của bạn đổi trạng thái, platform POST JSON tới `webhook_url` đã đăng ký:
                    ```json
                    {"eventId": "<uuid>", "orderId": "<uuid>", "partnerRef": "<ref của bạn>",
                     "status": "PAID", "occurredAt": "2026-09-07T03:00:00Z"}
                    ```
                    Header **`X-Signature`** = hex lowercase của `HMAC-SHA256(webhookSecret, rawBody)` —
                    **luôn verify trước khi tin body** (dùng RAW body, trước khi parse JSON):

                    **Java:**
                    ```java
                    Mac mac = Mac.getInstance("HmacSHA256");
                    mac.init(new SecretKeySpec(secret.getBytes(UTF_8), "HmacSHA256"));
                    String expected = HexFormat.of().formatHex(
                        mac.doFinal(rawBody.getBytes(UTF_8)));
                    boolean valid = MessageDigest.isEqual(
                        expected.getBytes(UTF_8), signature.getBytes(UTF_8));
                    ```

                    **Node.js:**
                    ```js
                    const expected = crypto
                      .createHmac("sha256", secret).update(rawBody).digest("hex");
                    const valid = crypto.timingSafeEqual(
                      Buffer.from(expected), Buffer.from(signature, "hex"));
                    ```

                    **curl:**
                    ```bash
                    EXPECTED=$(printf '%s' "$RAW_BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
                    ```

                    - `eventId` dùng để **dedupe** phía bạn (webhook gửi at-least-once).
                    - Lỗi mạng/5xx: platform retry exponential **tối đa 3 lần** rồi chuyển DLQ
                      (bạn có thể xin replay).
                    """))
            .components(new Components().addSecuritySchemes(SCHEME_NAME,
                new SecurityScheme()
                    .type(SecurityScheme.Type.APIKEY)
                    .in(SecurityScheme.In.HEADER)
                    .name("X-API-Key")
                    .description("API key đối tác dạng pk_... — sai/hết hạn/revoke → 401")));
    }
}
