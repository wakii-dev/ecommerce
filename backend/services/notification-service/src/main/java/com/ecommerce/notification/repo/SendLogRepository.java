package com.ecommerce.notification.repo;

import com.ecommerce.notification.domain.SendLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SendLogRepository extends JpaRepository<SendLog, UUID> {
}
