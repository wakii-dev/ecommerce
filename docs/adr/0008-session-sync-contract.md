# ADR 0008 — Session sync contract (FI-399, story FI-397)

Date: 2026-09-09 · Status: Accepted · Owner: packages/auth (SF-2)

## Context
Access token chỉ sống in-memory; refresh dựa cookie httpOnly one-time rotate
(replay cookie cũ → 401). N tab refresh đồng thời với cùng cookie → 1 thắng,
N-1 nhận 401 → AuthStore logout NGAY → **spurious logout user-visible**. Ngoài
ra login/logout 1 tab không lan tab khác; 127.0.0.1 vs localhost = 2 cookie host.

## Decision
1. **Channel**: BroadcastChannel `ecommerce.auth` (primary) + localStorage
   sentinel `ecommerce.auth-sync` (fallback, value `{v:1,t,n,type}` — n = nonce để
   storage event luôn fire khi 2 transition cùng ms; `type` = type của message
   được post (P0 FI-399 review: sentinel không mang type thì mọi post bị nhận
   thành `auth-changed` → handshake start/done tự gây refresh → exponential
   storm); receiver CHỈ nhận whitelist `auth-changed|refresh-start|refresh-done`,
   sentinel v1 bare (không type, bản cũ) = `auth-changed`; KHÔNG token trong
   message).
2. **Broadcast transition-only**: chỉ khi isAuthenticated() FLIP auth↔unauth
   (subscriber-diff trên authStore). Refresh rotate token (authed→authed) không
   broadcast → chặn BC loop N-tab. Receiver nhận `auth-changed` → refresh()
   cookie-roundtrip (không áp token từ message); tự flip thì tự broadcast
   (đúng luật) — sóng N-tab tắt sau tối đa N broadcast, tự nhiên.
   **Chi phí đã biết (không phải bug)**: N tab boot guest→authed = O(N²) POST
   thừa (mỗi tab mới broadcasts → các tab đã-authed refresh lại vô nghĩa).
   Chấp nhận — chấp-range dev/small-N; optimize sau nếu cần.
3. **Cross-tab refresh coordination** (P0): mọi refresh() chạy trong
   Web Locks `ecommerce.auth-refresh` (origin-global) → POST tuần tự, mỗi POST
   đọc cookie mới nhất → không replay. Fallback (không có navigator.locks):
   BC handshake `refresh-start/refresh-done` + jitter 50-150ms + chờ remote
   xong (timeout 5s) — **best-effort**, message-crossing 2 tab start cùng lúc
   KHÔNG được serialize đầy đủ (khai báo rõ; Web Locks là path chuẩn).
4. **401-refresh retry ĐÚNG 1 lần** sau backoff 400ms, BÊN TRONG lock, CHỈ khi
   (fallback || contender) **VÀ** failure của attempt 1 là HTTP 401 (P1#2 FI-399
   review: network throw/500/timeout/body sai không phải evidence rotate →
   KHÔNG retry, logout nguyên trạng ở attempt 1) — contender = có bằng chứng
   rotate có thể xảy ra lúc mình chờ: (a) đang fallback mode, hoặc
   (b) navigator.locks.query() thấy holder khác CỦA CHÍNH lock này
   (`held.some(l => l.name === LOCK_NAME)`). Không contender + không fallback →
   401 là cookie thật chết → logout NGAY (1 POST, không backoff) — guest boot
   không bị thuế 2 POST + 400ms authReady.
   (Edge: `locks.request()` throw giữa chừng vì API lỗi (KHÔNG phải callback
   refresh throw — P1#3: callback throw rethrow nguyên, không chạy lại
   unlocked) — chạy KHÔNG lock với {fallback:true, contender:true} = retry
   enabled, an toàn là trên.)
5. **Timeout**: POST refresh mang AbortSignal.timeout(10s) — fetch treo không
   giữ lock vô hạn (lock là coupling cross-tab mới).
6. **SSR-guard**: mọi Web API chạm sau `typeof window === 'undefined'` return —
   KHÔNG BAO GIỜ guard bằng `typeof BroadcastChannel` (Node 18+ có BC native).
   configureAuth auto-start idempotent (module-level handle).
7. **Seam**: `createSessionSync(store, deps)` wrap `store.refresh`; `stop()`
   restore. deps DI (bus/locks/backoff/jitter) — unit test dùng CÙNG seam với
   production path (`createSessionSync(authStore)` từ configureAuth).
8. **Redirect 127→localhost**: Next middleware guard đầu hàm (308 giữ
   path+query — `?ref` vẫn capture ở hop sau) + matcher loại trừ toàn bộ
   `/_next/*` (cùng favicon/robots/sitemap/api); Vite plugin
   `redirect-127-to-localhost` trong preset (mọi MFE dev server; skip ws
   upgrade). Lý do: cookie host-scoped — 2 hostname = 2 jar.
9. **Guest-cart key contract**: localStorage key `ecommerce.guest_cart_token`
   là CÙNG 1 literal ở cả storefront (AddToCart ghi) và checkout (cartApi
   `GUEST_CART_TOKEN_KEY` đọc) — 1 origin, 1 key, giỏ chung. 2 app không import
   chéo được → binary test extract literal từ cả 2 source + roundtrip
   2-storage-context (`guest-cart-key.test.ts`).

## Consequences
- Login/logout lan tức thì đa tab/app cùng origin; 20-run rotate-race 0 spurious
  logout (unit + e2e regression).
- Cookie contract `/api/identity` không đổi; zero backend change; dep freeze
  (BC/Web Locks/storage = Web API).
- 2FA challenge không broadcast (throw trước setToken); OAuth callback broadcast
  tự nhiên.
- Roadmap migration (b) account→checkout thuộc SF-5 (ADR riêng).
