package com.ecommerce.payment;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * App payment CHO RIÊNG saga IT (lý-do hẹp scan xem SagaOrderingTestApp):
 * đặt tại package com.ecommerce.payment để repository scan mặc định đúng.
 * Flyway TẮT trong IT.
 */
@SpringBootApplication(scanBasePackages = {"com.ecommerce.payment", "com.ecommerce.common"})
@EntityScan({"com.ecommerce.payment.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class SagaPaymentTestApp {
}
