package com.ecommerce.ordering.repo;

import com.ecommerce.ordering.domain.SagaState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SagaStateRepository extends JpaRepository<SagaState, UUID> {
}
