package com.ecommerce.identity.auth;

import com.ecommerce.identity.config.SeedProperties;
import com.ecommerce.identity.user.Role;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Seed admin idempotent từ ADMIN_EMAIL/ADMIN_PASSWORD (yml default RỖNG = skip).
 * KHÔNG publish user.created (seed là system action — spec §4.2).
 */
@Component
public class SeedAdmin implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedAdmin.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SeedProperties props;

    public SeedAdmin(UserRepository userRepository, PasswordEncoder passwordEncoder, SeedProperties props) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (props.adminEmail() == null || props.adminEmail().isBlank()
            || props.adminPassword() == null || props.adminPassword().isBlank()) {
            log.info("[seed-admin] ADMIN_EMAIL/ADMIN_PASSWORD không set — bỏ qua seed");
            return;
        }
        String email = props.adminEmail().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            log.info("[seed-admin] {} đã tồn tại — skip (idempotent)", email);
            return;
        }
        UserEntity admin = new UserEntity();
        admin.setEmail(email);
        admin.setPasswordHash(passwordEncoder.encode(props.adminPassword()));
        admin.setFullName("Admin");
        admin.setRole(Role.ADMIN);
        userRepository.save(admin);
        log.info("[seed-admin] đã tạo admin {}", email);
    }
}
