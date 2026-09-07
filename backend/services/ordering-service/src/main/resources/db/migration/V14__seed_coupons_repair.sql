-- V14 (FI-366 SF-1 T13): seed-coupon repair — pack sf-10 values, idempotent.
--
-- WHY: V11 seed WELCOME10 thiếu usage_limit + ends_at (NULL = không hạn) —
-- coupon center + checkout hiển thị "không hạn chế" sai spec pack sf-10
-- (WELCOME10: 10%, min 100k, LIMIT 100, hạn +30 ngày). seed.sh đã UPSERT-override
-- runtime trên volume dev, nhưng compose-fresh (make full, volume rỗng) chỉ chạy
-- Flyway — thiếu repair này coupon mới sai vĩnh viễn.
--
-- NUMBER: pack/spec ghi "V12 free" — STALE: V12/V13 đã bị SF-14 (rma) lấy trên
-- cả repo lẫn volume dev (installed 2026-09-07 19:17). E5 cho phép xin number →
-- V14. Chạy đúng cả volume dev cũ (ON CONFLICT update) lẫn compose fresh.
--
-- now() + interval evaluated PER-ROW lúc migrate — hạn 30 ngày tính từ lúc
-- volume đó migrate, không hardcode ngày (idempotent qua DO UPDATE: re-migrate
-- không xảy ra với Flyway, nhưng seed.sh giữ giá trị tương thích 1:1).
INSERT INTO coupons (code, type, value, min_order_value, starts_at, ends_at, usage_limit, active, description)
VALUES
  ('WELCOME10', 'PERCENT', 10, 100000, now(), now() + interval '30 days', 100, TRUE, 'Giảm 10% tối đa đơn 100.000d — hạn 30 ngày'),
  ('GIAM50K', 'FIXED', 50000, 500000, now(), NULL, 100, TRUE, 'Giảm 50.000d cho đơn từ 500.000d')
ON CONFLICT (code) DO UPDATE SET
  type = EXCLUDED.type,
  value = EXCLUDED.value,
  min_order_value = EXCLUDED.min_order_value,
  ends_at = EXCLUDED.ends_at,
  usage_limit = EXCLUDED.usage_limit,
  active = TRUE;
