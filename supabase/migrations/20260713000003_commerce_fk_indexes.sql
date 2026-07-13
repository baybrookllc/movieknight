-- ═══════════════════════════════════════════════════════════════
-- Commerce foreign-key covering indexes (2026-07-13)
--
-- Follow-up to 20260713000002. After the commerce schema (20260712000001)
-- was applied to prod, get_advisors(performance) flagged 4 commerce foreign
-- keys still lacking a covering index (the commerce migration indexed its main
-- lookup columns but not every FK). Add them — purely additive, same rationale
-- as 20260713000002. Idempotent.
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_cart_items_listing_id     ON public.cart_items(listing_id);
CREATE INDEX IF NOT EXISTS idx_order_items_edition_id     ON public.order_items(edition_id);
CREATE INDEX IF NOT EXISTS idx_order_items_listing_id     ON public.order_items(listing_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_address_id ON public.orders(shipping_address_id);
