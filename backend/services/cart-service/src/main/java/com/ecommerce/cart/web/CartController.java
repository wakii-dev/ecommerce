package com.ecommerce.cart.web;

import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.ecommerce.cart.domain.CartModels.CartDocument;
import com.ecommerce.cart.service.CartService;
import com.ecommerce.cart.service.CartService.CartRef;
import com.ecommerce.cart.store.CartStore;
import com.ecommerce.cart.web.dto.CartDtos.AddItemRequest;
import com.ecommerce.cart.web.dto.CartDtos.CartResponse;
import com.ecommerce.cart.web.dto.CartDtos.MergeCartRequest;
import com.ecommerce.cart.web.dto.CartDtos.UpdateItemRequest;

import jakarta.validation.Valid;

/**
 * Cart API (SF-6) — path FULL prefix {@code /api/cart} (Conventions #11, gateway
 * KHÔNG StripPrefix — route SF-6 đã xóa StripPrefix của placeholder). Shapes
 * khớp {@code contracts/openapi/cart.yaml}.
 *
 * <p>Identity: JWT hợp lệ → giỏ {@code cart:user:{sub}}; không token → guest
 * theo cookie {@code cart_token}; token CÓ nhưng sai → 401 (fail-closed,
 * SecurityConfig resource-server).</p>
 */
@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService cart;
    private final CartStore store;
    private final CookieSupport cookie;

    public CartController(CartService cart, CartStore store, CookieSupport cookie) {
        this.cart = cart;
        this.store = store;
        this.cookie = cookie;
    }

    // ── POST /api/cart — tạo giỏ guest (201 + Set-Cookie) ─────────────────

    @PostMapping
    public ResponseEntity<CartResponse> createCart(
        @CookieValue(name = "cart_token", required = false) String cookieToken) {
        String sub = currentUserSub();
        if (sub != null) {
            // User đăng nhập gọi create: trả giỏ user (ensure) — 200, không cookie
            CartRef ref = cart.loadOrCreateUser(sub);
            return ResponseEntity.ok(cart.toResponse(ref.doc(), null));
        }
        // Guest đã có giỏ sống → idempotent trả giỏ đó (không cấp token mới)
        Optional<CartRef> existing = cart.loadGuest(cookieToken);
        if (existing.isPresent()) {
            return ResponseEntity.ok(cart.toResponse(existing.get().doc(), cookieToken));
        }
        CartRef created = cart.createGuest();
        store.save(created.key(), created.doc());
        return ResponseEntity.status(HttpStatus.CREATED)
            .header(org.springframework.http.HttpHeaders.SET_COOKIE, cookie.issue(created.guestToken()).toString())
            .body(cart.toResponse(created.doc(), created.guestToken()));
    }

    // ── GET /api/cart — guest 404 khi chưa có; user auto-ensure giỏ rỗng ───

    @GetMapping
    public CartResponse getCart(
        @CookieValue(name = "cart_token", required = false) String cookieToken) {
        String sub = currentUserSub();
        if (sub != null) {
            CartRef ref = cart.loadOrCreateUser(sub);
            // A4: stamp email lần ĐẦU thiếu thôi — không rewrite/TTL-refresh
            // mỗi GET (review G2 P2: write amplification + giỏ bất tử)
            CartDocument doc = ref.doc();
            String email = currentUserEmail();
            if (email != null && doc.email() == null) {
                doc = doc.withEmail(email);
                store.save(ref.key(), doc);
            }
            return cart.toResponse(cart.enrichAll(doc), null);
        }
        CartRef guest = cart.loadGuest(cookieToken)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "guest_cart_not_found — chưa có giỏ (không có cookie cart_token)"));
        return cart.toResponse(cart.enrichAll(guest.doc()), guest.guestToken());
    }

    // ── POST /api/cart/items — add (+ auto-create guest + Set-Cookie path này) ──

    @PostMapping("/items")
    public ResponseEntity<CartResponse> addItem(
        @RequestParam(name = "slug", required = false) String slug,
        @Valid @RequestBody AddItemRequest request,
        @CookieValue(name = "cart_token", required = false) String cookieToken) {
        int qty = request.qty() == null ? 1 : request.qty();
        if (qty < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "qty phải ≥ 1");
        }

        String sub = currentUserSub();
        CartRef ref;
        boolean setGuestCookie = false;
        if (sub != null) {
            ref = cart.loadOrCreateUser(sub);
        } else {
            Optional<CartRef> guest = cart.loadGuest(cookieToken);
            if (guest.isPresent()) {
                ref = guest.get();
            } else {
                // Auto-create + Set-Cookie TRÊN CHÍNH response này (pin spec —
                // không có nó giỏ guest mồ côi vì FE chỉ gọi POST /items)
                ref = cart.createGuest();
                setGuestCookie = true;
            }
        }

        CartService.AddOutcome outcome = cart.addLine(ref.doc(), request.productId(),
            request.variantId(), qty, Boolean.TRUE.equals(request.allowOos()), slug);
        store.save(ref.key(), stamped(outcome.doc()));

        ResponseEntity.BodyBuilder builder = ResponseEntity.ok();
        if (setGuestCookie) {
            builder.header(org.springframework.http.HttpHeaders.SET_COOKIE,
                cookie.issue(ref.guestToken()).toString());
        }
        return builder.body(cart.toResponse(outcome.doc(), setGuestCookie ? ref.guestToken() : null));
    }

    // ── PATCH /api/cart/items/{itemId} — đổi qty ──────────────────────────

    @PatchMapping("/items/{itemId}")
    public CartResponse updateItem(@PathVariable String itemId,
                                   @Valid @RequestBody UpdateItemRequest request,
                                   @CookieValue(name = "cart_token", required = false) String cookieToken) {
        if (request.qty() == null || request.qty() < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "qty phải ≥ 1 (xóa thì DELETE)");
        }
        CartRef ref = resolveExisting(cookieToken);
        UUID lineId = parseLineId(itemId);
        CartDocument updated = cart.patchQty(ref.doc(), lineId, request.qty());
        store.save(ref.key(), stamped(updated));
        return cart.toResponse(updated, ref.guestToken());
    }

    // ── DELETE /api/cart/items/{itemId} — xóa 1 line (200 + Cart) ─────────

    @DeleteMapping("/items/{itemId}")
    public CartResponse removeItem(@PathVariable String itemId,
                                   @CookieValue(name = "cart_token", required = false) String cookieToken) {
        CartRef ref = resolveExisting(cookieToken);
        UUID lineId = parseLineId(itemId);
        CartDocument updated = cart.removeLine(ref.doc(), lineId);
        store.save(ref.key(), stamped(updated));
        return cart.toResponse(updated, ref.guestToken());
    }

    // ── POST /api/cart/merge — guest → user (JWT bắt buộc; security chain) ─

    @PostMapping("/merge")
    public ResponseEntity<CartResponse> merge(
        @RequestBody(required = false) MergeCartRequest request,
        @CookieValue(name = "cart_token", required = false) String cookieToken) {
        String sub = currentUserSub();
        if (sub == null) {
            // Phòng hờ (SecurityConfig đã chặn authenticated()) — defense in depth
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "merge cần đăng nhập");
        }
        // Body cartToken REQUIRED theo contract; cookie chỉ là leniency khi body rỗng
        String guestToken = request != null && request.cartToken() != null && !request.cartToken().isBlank()
            ? request.cartToken()
            : cookieToken;
        if (guestToken == null || guestToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cartToken là bắt buộc");
        }
        String guestKey = CartStore.guestKey(guestToken);
        CartDocument guestDoc = store.load(guestKey)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "guest_cart_not_found — token sai hoặc giỏ đã hết hạn"));

        CartRef userRef = cart.loadOrCreateUser(sub);
        CartDocument merged = stamped(cart.merge(userRef.doc(), guestDoc));
        store.save(userRef.key(), merged);
        store.delete(guestKey); // sau merge guest hết hiệu lực (contract)
        return ResponseEntity.ok()
            .header(org.springframework.http.HttpHeaders.SET_COOKIE, cookie.expire().toString())
            .body(cart.toResponse(merged, null));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /** Giỏ PHẢI tồn tại sẵn (guest theo cookie / user key) — PATCH/DELETE dùng. */
    private CartRef resolveExisting(String cookieToken) {
        String sub = currentUserSub();
        if (sub != null) {
            return cart.loadOrCreateUser(sub);
        }
        return cart.loadGuest(cookieToken)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "guest_cart_not_found"));
    }

    private UUID parseLineId(String itemId) {
        try {
            return UUID.fromString(itemId);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "item_not_found — " + itemId);
        }
    }

    /** {@code sub} của JWT; null khi anonymous. Token sai → 401 ở filter (không tới đây). */
    private String currentUserSub() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            return jwtAuth.getToken().getSubject();
        }
        return null;
    }

    /** Email từ JWT claim (SF-13 A4 — abandoned cart); null khi anonymous/không claim. */
    private String currentUserEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            return jwtAuth.getToken().getClaimAsString("email");
        }
        return null;
    }

    /** Gắn email JWT vào doc (user mutation — sweeper abandoned cần); guest giữ nguyên. */
    private CartDocument stamped(CartDocument doc) {
        String email = currentUserEmail();
        return email == null ? doc : doc.withEmail(email);
    }
}
