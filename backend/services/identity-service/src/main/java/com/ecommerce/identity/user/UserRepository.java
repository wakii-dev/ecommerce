package com.ecommerce.identity.user;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {
    Optional<UserEntity> findByEmail(String email);
    boolean existsByEmail(String email);

    @Query("""
           select u from UserEntity u
           where (cast(:q as string) is null
                       or lower(u.email) like lower(concat('%', :q, '%'))
                       or lower(u.fullName) like lower(concat('%', :q, '%')))
           """)
    Page<UserEntity> search(@Param("q") String q, Pageable pageable);
}
