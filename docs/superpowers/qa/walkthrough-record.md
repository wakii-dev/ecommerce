# SF-5 walkthrough record (FI-402)

> Rule 0: coordinator TỰ mở browser đi flow + TỰ nhìn screenshots — không tin report agent. Evidence: `docs/superpowers/qa/walkthrough/` · Video sync demo: `.run/sf5-sync-video/` + copy ở walkthrough/ · Rig: dev entry :3400 (Rig A) + isolated :8480 (Rig B).

## 1. One-origin golden path (T2) — entry :3400, không đổi port

Flow: home → PLP → PDP → cart → checkout → confirmation → account + /admin.

| # | Bước | URL | Evidence | Kết quả |
|---|---|---|---|---|
| 1 | Home SSR chrome | `/vi` | walkthrough/t2-01-home.png | __PENDING__ |
| 2 | PLP | `/c/...` | walkthrough/t2-02-plp.png | __PENDING__ |
| 3 | PDP + add-to-cart | `/p/...` | walkthrough/t2-03-pdp.png | __PENDING__ |
| 4 | Cart (shell route qua entry) | `/cart` | walkthrough/t2-04-cart.png | __PENDING__ |
| 5 | Checkout | `/checkout` | walkthrough/t2-05-checkout.png | __PENDING__ |
| 6 | Confirmation | `/order/confirmation/...` | walkthrough/t2-06-confirmation.png | __PENDING__ |
| 7 | Account | `/account` | walkthrough/t2-07-account.png | __PENDING__ |
| 8 | /admin (layout riêng full-bleed, KHÔNG chrome) | `/admin` | walkthrough/t2-08-admin.png | __PENDING__ |
| 9 | HMR re-verify (remoteEntry 200 + ws vite-hmr clientPort) | — | remoteEntry + `__mf_hmr` metadata **200 qua entry :3400**; ws `vite-hmr`: shell :5573 `/` OPEN · checkout :5585 `/remotes/checkout/` OPEN · account :5586 `/remotes/account/` OPEN (probe node:crypto-free WebSocket subprotocol `vite-hmr` — 10:5x 09-09) | ✅ PASS |

## 2. Sync demo (T1) — video + evidence

Login/logout lan tức thì 2 tab 2 app, không reload, không spurious logout (20-run):
- Video: __PENDING__ (recordVideo từ session-sync-matrix.spec)
- Bảng case × verdict: `docs/superpowers/qa/sync-matrix.md`

## 3. Chrome cross-host consistency (T7)

Screenshots 4 trạng thái × 2 host + results.json: `walkthrough/chrome-consistency/` — verdict `visual-consistency.md`.

## 4. Chuẩn bị STORY-COMPLETE

Epic cần: link artifacts (mục này) + ADR 0009 + findings epic comment + merge hash.
