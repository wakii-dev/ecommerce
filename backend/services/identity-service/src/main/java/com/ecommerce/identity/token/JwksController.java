package com.ecommerce.identity.token;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** JWKS công khai (T1 scaffold) — gateway + services verify JWT qua đây. */
@RestController
public class JwksController {
    private final TokenService tokenService;
    public JwksController(TokenService tokenService) { this.tokenService = tokenService; }

    @GetMapping("/.well-known/jwks.json")
    public Map<String, Object> jwks() { return tokenService.jwks(); }
}
