# T3 — Reduced-Motion Sweep (FI-396 / SF-6 convergence-qa)

- **Ngày chạy:** 2026-09-09 · rig live: Next `127.0.0.1:3101` · shell `localhost:5703` · account `:5706` · admin `:5707`
- **Script:** `scripts/qa/reduced-motion.mjs` (Playwright, `reducedMotion: 'reduce'` ở context level + context baseline riêng không reduce)
- **Phạm vi:** read-only sweep; đúng 1 lần ATC trên PDP để kiểm toast (theo đúng đề bài T3.7 — không đặt order, không toggle coupon)
- **Kết quả: PASS — 15/15 check (kèm 3 baseline đối chiếu). Không có fail-list.**

## Tổng quát cơ chế gate đã verify

| Lớp | Vị trí | Hành vi dưới `reduce` |
|---|---|---|
| Global gate (SF-1) | `packages/ui-kit/src/styles/ui-kit.css:1456` | `*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; animation-iteration-count: 1 }` — computed đo được `1e-05s` (= 0.01ms) trên mọi page probe |
| JS gate reveal (SF-1) | `packages/ui-kit/src/components/useReveal.ts` | `matchMedia('(prefers-reduced-motion: reduce)')` → hook **no-op**: class `uk-reveal--pending` không bao giờ được thêm (belt-and-suspenders với CSS) |
| Ken-burns hero (SF-2) | `apps/storefront-web/app/app.css:564` | `.hero-slide::before { animation: none; transform: none }` |
| PDP toast (SF-2) | `apps/storefront-web/app/app.css:1818` | `.pdp-toast { animation: none }` |
| Auto-rotate hero (SF-2) | `apps/storefront-web/components/home/HeroCarousel.tsx:44` | `if (paused || hovered || motionReduced) return` — interval 6s không được tạo |

## Bảng verdict chi tiết

| ID | Check | Verdict | Bằng chứng đo được |
|---|---|---|---|
| RM-1 | Global gate — Next home | PASS | 6 transitions trên page, tất cả `1e-05s`; gate stylesheet (`uk-reveal--pending` rule) loaded |
| RM-2 | Ken-burns hero gate | PASS | `.hero-slide::before`: `animation-name=none`, `transform=none` (baseline: `hero-kb` 16s) |
| RM-3 | Hero vẫn render frame tĩnh | PASS | slide box 1248×380px |
| RM-4a | Auto-rotate DỪNG trong 7s | PASS | active dot `is-active` slide 1 giữ nguyên t0→t+7s; track transform không đổi (`matrix(1,0,0,1,0,0)`) |
| RM-4b | Arrows/dots vẫn hoạt động | PASS | bấm "Slide sau" → active dot chuyển slide 1→2 ngay lập tức |
| RM-5 | Reveal: nội dung hiện NGAY không cần scroll | PASS | 0 `uk-reveal--pending`, section dưới fold opacity=[1,1,1] (baseline có 10/11 pending, opacity [1,0,0]) |
| RM-6 | Skeleton shimmer tĩnh nhưng skeleton VẪN HIỆN | PASS | shell `/cart` (delay `/api/**` 2.5s per-context): `.uk-skeleton uk-skeleton--rect` visible, `animation=uk-skeleton-pulse dur=1e-05s` (baseline 1.3s) |
| RM-7a | PDP toast tức thời + tự đóng | PASS | ATC → toast tại +120ms: visible, `animation=none dur=1e-05s opacity=1`; +4.3s đã tự đóng |
| RM-7b | Mini-cart drawer tức thời + ESC đóng | PASS | badge click → +100ms panel visible, `transition=1e-05s opacity=1`; ESC → đóng |
| RM-8b | Global gate — Next PDP | PASS | 6 transitions `1e-05s`, gate css loaded |
| RM-8c | Global gate — Vite shell home | PASS | 6 transitions `1e-05s`, gate css loaded |
| RM-8d | Global gate — Vite admin | PASS | 6 transitions `1e-05s`, gate css loaded |

## Baseline đối chiếu (chứng minh check có nghĩa — animation CÓ tồn tại khi không reduce)

| ID | Check | Verdict | Bằng chứng |
|---|---|---|---|
| BL-1 | Ken-burns animate bình thường | PASS | `.hero-slide::before` `animation=hero-kb dur=16s` |
| BL-2 | Auto-rotate chạy bình thường | PASS | active dot 1→2 sau 7.5s (interval 6s) |
| BL-3 | Reveal pending bình thường | PASS | 11 reveal els, 10 pending, opacity [1,0,0] trước scroll |

## Bằng chứng ảnh

- `docs/superpowers/qa/walkthrough/reduced-motion/rm-home-top.png` — home dưới reduce (hero tĩnh)
- `docs/superpowers/qa/walkthrough/reduced-motion/baseline-home.png` — home baseline
- `docs/superpowers/qa/walkthrough/reduced-motion/rm-cart-skeleton.png` — skeleton hiển thị (animation gate)
- `docs/superpowers/qa/walkthrough/reduced-motion/rm-pdp-toast.png` — toast tức thời
- `docs/superpowers/qa/walkthrough/reduced-motion/rm-shell-drawer.png` — drawer mở
- `docs/superpowers/qa/walkthrough/reduced-motion/rm-admin.png` — admin gate

## Ghi chú

- Admin login không đạt trong rig (xem phát hiện chung ở `responsive-375-768.md` — JWT không set cookie), nên RM-8d probe gate chạy ở root page chưa đăng nhập; gate stylesheet của ui-kit đã xác nhận loaded, mọi transition đo được đều 0.01ms.
- Kết quả JSON thô: `/tmp/rm-results.json`.
