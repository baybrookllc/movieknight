-- ═══════════════════════════════════════════════════════════════
-- PHYSICAL-MEDIA COMMERCE — Phase P0 (schema + RLS + tax reference)
--
-- See ADAM_DOCS/commerce-vertical-plan.md. First-party retail MVP with a
-- marketplace-ready schema: listings.seller_id is nullable (NULL = first-party
-- stock); a future P2P phase populates it without a schema rewrite.
--
-- Money is stored in integer cents (never floats). Orders are written only by
-- trusted server code (service role) after payment confirmation — clients have
-- no INSERT/UPDATE grant on orders.
-- ═══════════════════════════════════════════════════════════════

-- ── Physical editions of a tracked title ─────────────────────────
CREATE TABLE IF NOT EXISTS product_editions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id        text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  format          text NOT NULL CHECK (format IN ('dvd','bluray','4k','vhs','boxset')),
  edition_name    text,                    -- e.g. "Criterion Collection #712"
  region          text,                    -- disc region: A/B/C or 1/2/3…
  upc             text,
  cover_image_url text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title_id, format, edition_name)
);

-- ── A thing for sale (first-party when seller_id IS NULL) ─────────
CREATE TABLE IF NOT EXISTS listings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id  uuid NOT NULL REFERENCES product_editions(id) ON DELETE CASCADE,
  seller_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = first-party
  condition   text NOT NULL DEFAULT 'new'
                   CHECK (condition IN ('new','like_new','good','fair')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency    text NOT NULL DEFAULT 'CAD',
  quantity    integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  status      text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','sold','paused')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Buyer shipping addresses ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipping_addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  line1       text NOT NULL,
  line2       text,
  city        text NOT NULL,
  province    text NOT NULL,               -- 2-letter CA province/territory code
  postal_code text NOT NULL,
  country     text NOT NULL DEFAULT 'CA',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Server-persisted cart (one per user) ─────────────────────────
CREATE TABLE IF NOT EXISTS carts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id    uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  quantity   integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, listing_id)
);

-- ── Orders (written server-side only, after payment) ─────────────
CREATE TABLE IF NOT EXISTS orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- keep order if user deleted
  status         text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','fulfilled','cancelled','refunded')),
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents      integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  total_cents    integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  currency       text NOT NULL DEFAULT 'CAD',
  stripe_payment_intent_id text,
  shipping_address_id uuid REFERENCES shipping_addresses(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Line items snapshot title/edition text so history survives listing deletion.
CREATE TABLE IF NOT EXISTS order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
  edition_id       uuid REFERENCES product_editions(id) ON DELETE SET NULL,
  title_id         text,
  title_snapshot   text NOT NULL,
  edition_snapshot text,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Canadian combined sales-tax reference ────────────────────────
-- rate = combined GST/HST(+PST/QST) as a fraction. VERIFY against CRA before
-- go-live; provincial rates change (e.g. NS moved to 14% in 2025).
CREATE TABLE IF NOT EXISTS tax_rates (
  province text PRIMARY KEY,               -- 2-letter code
  name     text NOT NULL,
  rate     numeric(6,5) NOT NULL CHECK (rate >= 0 AND rate < 1)
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_editions_title ON product_editions(title_id);
CREATE INDEX IF NOT EXISTS idx_listings_edition       ON listings(edition_id);
CREATE INDEX IF NOT EXISTS idx_listings_seller        ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_status        ON listings(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer           ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order      ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_addresses_user ON shipping_addresses(user_id);

-- ── Row-Level Security ───────────────────────────────────────────
-- Catalog (editions, listings, tax) is public-read. Cart/orders/addresses are
-- private to the owner. Orders have no client INSERT/UPDATE grant — only the
-- service role (which bypasses RLS) writes them, after payment.

ALTER TABLE product_editions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pe_select" ON product_editions FOR SELECT USING (true);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_select" ON listings FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid());
CREATE POLICY "listings_insert" ON listings FOR INSERT
  WITH CHECK (seller_id = auth.uid());          -- marketplace hook (P4); first-party via service role
CREATE POLICY "listings_update" ON listings FOR UPDATE
  USING (seller_id = auth.uid());

ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_select" ON tax_rates FOR SELECT USING (true);

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carts_all" ON carts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart_items_all" ON cart_items FOR ALL
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addr_all" ON shipping_addresses FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (buyer_id = auth.uid());

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_select" ON order_items FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE buyer_id = auth.uid()));

-- ── Grants ───────────────────────────────────────────────────────
GRANT SELECT ON product_editions TO anon, authenticated;
GRANT SELECT ON tax_rates        TO anon, authenticated;
GRANT SELECT ON listings         TO anon;
GRANT SELECT, INSERT, UPDATE ON listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON carts               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cart_items          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON shipping_addresses  TO authenticated;
GRANT SELECT ON orders      TO authenticated;   -- writes are service-role only
GRANT SELECT ON order_items TO authenticated;

-- ── Seed: Canadian tax rates (fractions; verify against CRA) ─────
INSERT INTO tax_rates (province, name, rate) VALUES
  ('AB','Alberta',                    0.05000),
  ('BC','British Columbia',           0.12000),
  ('MB','Manitoba',                   0.12000),
  ('NB','New Brunswick',              0.15000),
  ('NL','Newfoundland and Labrador',  0.15000),
  ('NS','Nova Scotia',                0.14000),
  ('NT','Northwest Territories',      0.05000),
  ('NU','Nunavut',                    0.05000),
  ('ON','Ontario',                    0.13000),
  ('PE','Prince Edward Island',       0.15000),
  ('QC','Quebec',                     0.14975),
  ('SK','Saskatchewan',               0.11000),
  ('YT','Yukon',                      0.05000)
ON CONFLICT (province) DO UPDATE SET name = EXCLUDED.name, rate = EXCLUDED.rate;

-- ── Seed: a few first-party editions + listings for popular titles ──
-- Guarded so it only runs where titles exist; safe to re-run.
INSERT INTO product_editions (title_id, format, edition_name, region)
SELECT id, 'bluray', 'Standard Edition', 'A'
FROM titles
WHERE popularity IS NOT NULL
ORDER BY popularity DESC
LIMIT 5
ON CONFLICT (title_id, format, edition_name) DO NOTHING;

INSERT INTO listings (edition_id, seller_id, condition, price_cents, currency, quantity, status)
SELECT pe.id, NULL, 'new', 2499, 'CAD', 10, 'active'
FROM product_editions pe
WHERE NOT EXISTS (SELECT 1 FROM listings l WHERE l.edition_id = pe.id);
