-- V13 (SF-14, D22 — review P1): chặn double-refund ở tầng DB.
-- D2 guard (existsByOrderIdAndStatus) chạy TRƯỚC tx là TOCTOU: 2 RMA cùng đơn
-- refund song song đều qua check → 2× full refund trên Stripe. Partial unique
-- index làm DB là authority: chỉ 1 row REFUNDED / order_id, race thua nhận
-- DataIntegrityViolation → 409.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rma_refunded_per_order
    ON rma_requests (order_id) WHERE status = 'REFUNDED';
