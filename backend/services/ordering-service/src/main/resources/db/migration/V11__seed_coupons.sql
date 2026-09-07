-- V11 (SF-9): seed coupon cho dev/demo (coupon center + checkout áp mã).
-- SF-10 sẽ bổ sung deterministic seed đầy đủ; đây là mức tối thiểu chạy được.
INSERT INTO coupons (code, type, value, min_order_value, starts_at, usage_limit, active, description)
VALUES
  ('WELCOME10', 'PERCENT', 10, 100000, now(), NULL, TRUE, 'Giảm 10% cho đơn từ 100.000d — chào mừng thành viên mới'),
  ('GIAM50K',   'FIXED',   50000, 500000, now(), 100, TRUE, 'Giảm 50.000d cho đơn từ 500.000d')
ON CONFLICT (code) DO NOTHING;
