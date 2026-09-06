package com.ecommerce.catalog.repo;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ecommerce.catalog.domain.CategoryEntity;

/**
 * Repository category — cây assemble trong memory từ {@code findAll()}
 * (1 query, Task 3); resolve slug filter theo vi HOẶC en.
 */
public interface CategoryRepository extends JpaRepository<CategoryEntity, UUID> {

    Optional<CategoryEntity> findBySlugViOrSlugEn(String slugVi, String slugEn);
}
