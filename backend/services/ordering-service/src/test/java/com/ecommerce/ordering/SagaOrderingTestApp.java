package com.ecommerce.ordering;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * App class CHO RIÊNG saga IT — scan BASE PACKAGES HẸP thay vì "com.ecommerce":
 * saga IT đặt jar inventory/payment lên cùng test classpath (boot 3 service
 * thật trong 1 JVM) — nếu scan com.ecommerce thì component của sibling cũng
 * bị nhặt vào context ordering (ReservationService/PaymentIntentService...)
 * → boot fail / hành vi sai. Flyway TẮT (conflict V10 3 jar) — AbstractSagaTest
 * áp migration tay qua JDBC.
 */
@SpringBootApplication(scanBasePackages = {
    "com.ecommerce.ordering.api", "com.ecommerce.ordering.config",
    "com.ecommerce.ordering.consumer", "com.ecommerce.ordering.saga",
    "com.ecommerce.ordering.service", "com.ecommerce.common"})
@EntityScan({"com.ecommerce.ordering.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class SagaOrderingTestApp {
}
