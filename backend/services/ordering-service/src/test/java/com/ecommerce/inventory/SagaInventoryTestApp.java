package com.ecommerce.inventory;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * App inventory CHO RIÊNG saga IT (lý-do hẹp scan xem SagaOrderingTestApp):
 * đặt tại package com.ecommerce.inventory để @SpringBootApplication quét
 * repositories mặc định đúng package này. Flyway TẮT trong IT.
 */
@SpringBootApplication(scanBasePackages = {"com.ecommerce.inventory", "com.ecommerce.common"})
@EntityScan({"com.ecommerce.inventory.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class SagaInventoryTestApp {
}
