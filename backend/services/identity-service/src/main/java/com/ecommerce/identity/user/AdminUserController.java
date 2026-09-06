package com.ecommerce.identity.user;

import com.ecommerce.identity.auth.AdminUserDto;
import com.ecommerce.identity.auth.AdminUserPage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** GET /admin/users — RBAC 2 lớp: gateway guard + @PreAuthorize tại service (D7). */
@RestController
@RequestMapping("/admin/users")
public class AdminUserController {

    private final UserRepository userRepository;

    public AdminUserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public AdminUserPage list(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String q) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        int safePage = Math.max(page, 1);
        // q rỗng → findAll (tránh bind null vào cast/concat JPQL — PG không xác
        // định được kiểu param null qua variadic concat → 500 "could not determine
        // data type of parameter").
        Page<UserEntity> result = (q == null || q.isBlank())
            ? userRepository.findAll(PageRequest.of(safePage - 1, safeSize))
            : userRepository.search(q.trim(), PageRequest.of(safePage - 1, safeSize));
        List<AdminUserDto> items = result.getContent().stream()
            .map(u -> new AdminUserDto(u.getId(), u.getEmail(), u.getFullName(),
                List.of(u.getRole().name()), u.getCreatedAt()))
            .toList();
        return new AdminUserPage(items, safePage, safeSize, result.getTotalElements() >= Integer.MAX_VALUE
            ? Integer.MAX_VALUE : (int) result.getTotalElements());
    }
}
