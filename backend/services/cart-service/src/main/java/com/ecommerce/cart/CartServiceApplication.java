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
 * + RabbitTemplate) — cart-service KHÔNG có JPA/Rabbit trên classpath (SF-6
 * không publish/consume events), scan đủ sẽ chết context vì thiếu bean. Khi
 * SF-10 thêm consumer {@code order.confirmed} (clear cart) → thêm
 * spring-boot-starter-amqp + common.outbox vào scan + repo outbox lúc ĐÓ.</p>
 */
@SpringBootApplication(scanBasePackages = {"com.ecommerce.cart", "com.ecommerce.common.web"})
public class CartServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(CartServiceApplication.class, args);
    }
}
