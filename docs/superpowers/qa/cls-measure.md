# SF-6 T9 — Perf/CLS measure + font check (FI-396)

- Ngày chạy: 2026-09-09 · Script: `scripts/qa/cls-measure.mjs` (PerformanceObserver layout-shift session-window + LCP + computed font) · Evidence: `scripts/qa/cls-results.json`
- Rig: storefront Next :3101 (code hợp nhất 8d775b8) · Baseline: main checkout :3000 (master) — **dev-mode numbers, noisier hơn prod** (note theo context pack)

## CLS + LCP (viewport 1280×800, 3s after load)

| Trang | Baseline master :3000 | Merged :3101 | Target |
|---|---|---|---|
| Home `/` | CLS **0** · LCP 176ms | CLS **0** · LCP 256ms | < 0.1 ✅ |
| PDP `/p/dien-thoai-xiaomi-redmi-13c` | CLS **0** · LCP 284ms | CLS **0.0039** (1 shift nhỏ) · LCP 152ms | < 0.1 ✅ |

**Verdict CLS: PASS** — cả home lẫn PDP sâu dưới target 0.1 (PDP merged có 1 shift 0.0039 — skeleton→content swap, không đáng kể). Baseline trước/sau đã ghi nhận theo §7.12.

## Font Be Vietnam Pro (epic §7.7 — 5 apps)

| App | Evidence | Verdict |
|---|---|---|
| storefront-web :3101 | body + h1 computed = `"Be Vietnam Pro", …` | ✅ |
| shell :5703 | body computed = Be Vietnam Pro | ✅ |
| mfe-account :5706 standalone | h1 'Đăng nhập' = Be Vietnam Pro (body element không có rule — render thật vẫn đúng font) | ✅ |
| mfe-checkout | standalone root là placeholder (n/a); shell-mounted :5703/checkout page-title = Be Vietnam Pro | ✅ |
| mfe-admin :5707 | shell-mounted :5703/admin — app text dùng --font-sans (guard screen render token) | ✅ |
| **woff2 fetch** | 45+ requests `be-vietnam-pro-{400..800}-{latin,vietnamese}.woff2` trên shell-checkout page — font thật sự tải, đủ subsets | ✅ |

**Verdict font §7.7: PASS** (5 apps — load thật + computed đúng).

## P2 note (fix-task proposal, không chặn)
- **SF-3**: shell header raw `<button>Tìm kiếm</button>` + `<input>` (không class) render font UA mặc định **Arial** — thiếu `font: inherit` cho form controls header (search bar là element prominent §2.1). File: `apps/shell/src/header.css`/HeaderSlots markup.

## Caveats
- next dev (không phải prod build) — CLS/LCP tuyệt đối có thể khác prod; số dùng làm by-convergence comparative + target-check.
- PDP đo trên product có sẵn; khách quan hơn khi đo nhiều PDP — ghi nhận 1 PDP đại diện theo context pack ("home + PDP").
