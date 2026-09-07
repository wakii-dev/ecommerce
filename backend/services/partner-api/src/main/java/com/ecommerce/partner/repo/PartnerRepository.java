package com.ecommerce.partner.repo;

import com.ecommerce.partner.domain.PartnerEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PartnerRepository extends JpaRepository<PartnerEntity, UUID> {

    Optional<PartnerEntity> findByName(String name);
}
