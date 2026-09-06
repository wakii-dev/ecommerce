package com.ecommerce.template.web;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/** Endpoint mẫu cho springdoc UI — fork service thật thì thay bằng API của mình. */
@RestController
@RequestMapping("/api/template")
@Tag(name = "template", description = "Smoke endpoints của service template")
public class PingController {

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of(
            "service", "template-service",
            "status", "ok",
            "at", Instant.now().toString()
        );
    }
}
