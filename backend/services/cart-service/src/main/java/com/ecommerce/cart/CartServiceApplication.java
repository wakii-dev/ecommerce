package com.ecommerce.cart;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * cart-service (SF-6, port 8083) — guest/user cart trên Redis (D8: cart KHÔNG
 * có DB riêng), merge-on-login, enrichment catalog/inventory.
 *
 * <p><strong>DEVIATION pattern fork (chủ đích — đọc trước khi "sửa lại"):
 * {@code scanBasePackages} KHÔNG phải {@code "com.ecommerce"} đầy đủ như các
 * service khác mà là 2 package:</strong></p>
 * <ul>
 *   <li>{@code com.ecommerce.cart} — code service.</li>
 *   <li>{@code com.ecommerce.common.web} — GlobalExceptionHandler (RFC 7807) +
 *       RequestIdMdcFilter. Đây là 2 @Component của common-lib service này cần.</li>
 * </ul>
 *
 * <p>Lý do không scan "com.ecommerce": common-lib còn có
 * {@code common.outbox.OutboxRelay} (@Component, deps = OutboxMessageRepository
 * + RabbitTemplate) — cart-service KHÔNG có JPA (không DB — D8) nên KHÔNG BAO
 * GIỜ scan common.outbox (thiếu repo sẽ chết context). SF-10 thêm consumer
 * {@code order.confirmed} (clear cart): chỉ thêm spring-boot-starter-amqp +
 * consumer/config riêng (RabbitMqConfig) — KHÔNG scan common.outbox, KHÔNG
 * IdempotentConsumer (DEL Redis tự idempotent, không có processed_messages);
 * exchange bean cart tự declare vì CommonLibAutoConfiguration backs off khi
 * thiếu JpaRepository trên classpath (xem RabbitMqConfig javadoc).</p>
 */
@SpringBootApplication(scanBasePackages = {"com.ecommerce.cart", "com.ecommerce.common.web"})
// SF-13 A4: abandoned-cart sweeper @Scheduled — common-lib auto-config KHÔNG
// bật scheduling ở đây (cart không JPA → CommonLibAutoConfiguration backs off)
// nên phải tự khai báo như OrderingServiceApplication.
@org.springframework.scheduling.annotation.EnableScheduling
public class CartServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(CartServiceApplication.class, args);
    }
}
