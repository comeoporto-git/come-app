-- Flexible per-year price tiers, per-service costs and a transport add-on.
--
-- Until now each service_prices row had three fixed tiers (2-3, 4-6, 7+).
-- From 2027 tiers differ per service (7-10 / 11-20, cooking classes at
-- 10-15 / 16-20 or 1-2 / 3-4 / 5-6), so prices move to one row per tier.
-- service_prices keeps the team-payment columns (valor_chef_*, copa,
-- driver); its pax_* columns stay for history but are no longer read.
--
-- Billing rules (sale_pricing):
--   * the price year is the one closest to the sale's date (earlier on a tie);
--   * the tier is the one whose range holds the group size; smaller groups use
--     the first tier, larger groups the last tier;
--   * the group is charged for the people who come, except a tier with
--     min_charged_pax (e.g. Capucine 1-2 is always charged for 2);
--   * a transport add-on (sales.transport_vehicle) adds the vehicle's price for
--     the service's transport_hours.
-- All prices are excl. VAT; faturação adds 23%.

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_price_tiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  year            int  NOT NULL,
  min_pax         int  NOT NULL CHECK (min_pax >= 1),
  max_pax         int  CHECK (max_pax IS NULL OR max_pax >= min_pax),
  price_per_pax   numeric NOT NULL,
  min_charged_pax int  CHECK (min_charged_pax IS NULL OR min_charged_pax >= 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, year, min_pax)
);
CREATE INDEX IF NOT EXISTS service_price_tiers_service_year_idx ON service_price_tiers(service_id, year);
ALTER TABLE service_price_tiers ENABLE ROW LEVEL SECURITY;

-- Estimated costs incl. VAT. tier_min/tier_max NULL = applies to every tier.
-- Fixed = per tour, Variable = per person.
CREATE TABLE IF NOT EXISTS service_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  year        int  NOT NULL,
  tier_min    int,
  tier_max    int,
  item        text NOT NULL,
  cost_type   text NOT NULL CHECK (cost_type IN ('Fixed', 'Variable')),
  amount      numeric NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_costs_service_year_idx ON service_costs(service_id, year);
ALTER TABLE service_costs ENABLE ROW LEVEL SECURITY;

-- Transport add-on price per vehicle and number of hours, excl. VAT.
CREATE TABLE IF NOT EXISTS transport_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle     text NOT NULL,
  hours       int  NOT NULL CHECK (hours > 0),
  price       numeric,
  sort_order  int NOT NULL DEFAULT 0,
  UNIQUE (vehicle, hours)
);
ALTER TABLE transport_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE services ADD COLUMN IF NOT EXISTS transport_hours int;
ALTER TABLE sales    ADD COLUMN IF NOT EXISTS transport_vehicle text;

-- ── Pricing function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sale_pricing(p_service_id uuid, p_date date, p_guests int, p_vehicle text)
RETURNS TABLE (
  price_year      int,
  price_per_pax   numeric,
  charged_pax     int,
  service_total   numeric,
  transport_total numeric
)
LANGUAGE sql STABLE AS $$
  WITH yr AS (
    SELECT t.year
    FROM service_price_tiers t
    WHERE t.service_id = p_service_id
    GROUP BY t.year
    ORDER BY abs(t.year - EXTRACT(YEAR FROM COALESCE(p_date, current_date))::int), t.year
    LIMIT 1
  ),
  tiers AS (
    SELECT t.* FROM service_price_tiers t JOIN yr ON yr.year = t.year
    WHERE t.service_id = p_service_id
  ),
  tier AS (
    SELECT * FROM (
      -- range that holds the group
      (SELECT 1 AS pri, t.* FROM tiers t
        WHERE COALESCE(p_guests, 0) BETWEEN t.min_pax AND COALESCE(t.max_pax, 2147483647)
        ORDER BY t.min_pax LIMIT 1)
      UNION ALL
      -- smaller than every tier: first tier
      (SELECT 2, t.* FROM tiers t
        WHERE COALESCE(p_guests, 0) < t.min_pax
        ORDER BY t.min_pax LIMIT 1)
      UNION ALL
      -- larger than every tier: last tier
      (SELECT 3, t.* FROM tiers t ORDER BY t.min_pax DESC LIMIT 1)
    ) x ORDER BY pri LIMIT 1
  ),
  transport AS (
    SELECT COALESCE(o.price, 0) AS price
    FROM services s
    JOIN transport_options o ON o.vehicle = p_vehicle AND o.hours = s.transport_hours
    WHERE s.id = p_service_id AND p_vehicle IS NOT NULL
  )
  SELECT
    (SELECT year FROM yr),
    tier.price_per_pax,
    CASE WHEN COALESCE(p_guests, 0) <= 0 THEN 0
         ELSE GREATEST(p_guests, COALESCE(tier.min_charged_pax, 0)) END,
    CASE WHEN COALESCE(p_guests, 0) <= 0 THEN 0
         ELSE tier.price_per_pax * GREATEST(p_guests, COALESCE(tier.min_charged_pax, 0)) END,
    COALESCE((SELECT price FROM transport), 0)
  FROM (SELECT 1) one
  LEFT JOIN tier ON true;
$$;

-- ── Faturação: earning created with each sale ────────────────────────────────

CREATE OR REPLACE FUNCTION create_earning_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF NEW.service_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM transactions WHERE sale_id = NEW.id AND type = 'Earning') THEN
    RETURN NEW;
  END IF;

  SELECT (COALESCE(p.service_total, 0) + COALESCE(p.transport_total, 0)) * 1.23
  INTO v_total
  FROM sale_pricing(NEW.service_id, NEW.date, NEW.number_of_guests, NEW.transport_vehicle) p;

  INSERT INTO transactions (notion_id, data, conta_pagamento, type, valor, sale_id, client_id)
  VALUES ('IN - ' || COALESCE(NEW.notion_id, ''), NEW.date, 'COME', 'Earning',
          COALESCE(v_total, 0), NEW.id, NEW.client_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── sales_computed: same columns, prices from the tiers ──────────────────────

CREATE OR REPLACE VIEW sales_computed AS
WITH sale_transactions AS (
  SELECT transactions.sale_id,
    sum(CASE WHEN transactions.type = 'Earning'::text THEN transactions.valor ELSE 0::numeric END) AS faturacao,
    sum(CASE WHEN transactions.type = 'Expense'::text THEN transactions.valor ELSE 0::numeric END) AS custo
  FROM transactions
  WHERE transactions.sale_id IS NOT NULL
  GROUP BY transactions.sale_id
)
SELECT s.id,
  s.notion_id,
  s.date,
  s.type,
  s.status,
  s.number_of_guests,
  s.names,
  s.meeting_point,
  s.notes,
  s.phone_number,
  s.email_link,
  s.driver_type,
  s.expenses_closed,
  s.gcal_event_id,
  s.synced_at,
  s.thread_ids,
  s.service_id,
  s.client_id,
  s.guide_id,
  s.chef_id,
  s.driver_id,
  s.created_at,
  CASE WHEN COALESCE(s.number_of_guests, 0) > 0
       THEN (COALESCE(p.service_total, 0) + COALESCE(p.transport_total, 0)) / s.number_of_guests
       ELSE 0::numeric END AS preco_unitario,
  COALESCE(p.service_total, 0) + COALESCE(p.transport_total, 0) AS preco_servico,
  (COALESCE(p.service_total, 0) + COALESCE(p.transport_total, 0)) * 1.23 AS preco_servico_iva,
  COALESCE(st.faturacao, 0::numeric) AS faturacao,
  COALESCE(st.custo, 0::numeric) AS custo,
  COALESCE(st.faturacao, 0::numeric) + COALESCE(st.custo, 0::numeric) AS lucro_tour,
  CASE
    WHEN COALESCE(st.faturacao, 0::numeric) <> 0::numeric THEN (COALESCE(st.faturacao, 0::numeric) + COALESCE(st.custo, 0::numeric)) / st.faturacao
    ELSE 0::numeric
  END AS pct_lucro,
  CASE
    WHEN COALESCE(s.number_of_guests, 0) > 0 THEN COALESCE(st.custo, 0::numeric) / s.number_of_guests::numeric
    ELSE 0::numeric
  END AS custo_por_pax,
  CASE
    WHEN COALESCE(s.number_of_guests, 0) > 0 THEN (COALESCE(st.faturacao, 0::numeric) + COALESCE(st.custo, 0::numeric)) / s.number_of_guests::numeric
    ELSE 0::numeric
  END AS lucro_por_pax
FROM sales s
LEFT JOIN LATERAL sale_pricing(s.service_id, s.date, s.number_of_guests, s.transport_vehicle) p ON true
LEFT JOIN sale_transactions st ON st.sale_id = s.id;

-- ── Data ─────────────────────────────────────────────────────────────────────

-- Existing years: the old 2-3 / 4-6 / 7+ columns become tiers. One person was
-- always charged as two, so the first tier starts at 1 with a 2-person minimum.
INSERT INTO service_price_tiers (service_id, year, min_pax, max_pax, price_per_pax, min_charged_pax)
SELECT service_id, year, 1, 3, pax_2_3, 2 FROM service_prices WHERE pax_2_3 IS NOT NULL
UNION ALL
SELECT service_id, year, 4, 6, pax_4_6, NULL FROM service_prices WHERE pax_4_6 IS NOT NULL
UNION ALL
SELECT service_id, year, 7, NULL, pax_7_plus, NULL FROM service_prices WHERE pax_7_plus IS NOT NULL
ON CONFLICT (service_id, year, min_pax) DO NOTHING;

-- New cooking class.
INSERT INTO services (name, type)
SELECT 'Cooking Class at Capucine', 'Cooking Class'
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Cooking Class at Capucine');

-- Transport: Fisherman Road 4 hours, Surprise Surprise 8 hours.
UPDATE services SET transport_hours = 4 WHERE trim(name) IN ('Fisherman Road', 'Fisherman Road + Chef');
UPDATE services SET transport_hours = 8 WHERE trim(name) LIKE 'Surprise Surprise%';

INSERT INTO transport_options (vehicle, hours, price, sort_order) VALUES
  ('Carro', 4, NULL, 1), ('Carro', 8, NULL, 2),
  ('Van',   4, NULL, 3), ('Van',   8, NULL, 4),
  ('Autocarro', 4, NULL, 5), ('Autocarro', 8, NULL, 6)
ON CONFLICT (vehicle, hours) DO NOTHING;

-- 2027 prices (Service Pricing Calculator - Final).
WITH v(service_name, min_pax, max_pax, price, min_charged) AS (VALUES
  ('Fisherman Road + Chef', 2, 3, 200, NULL), ('Fisherman Road + Chef', 4, 6, 175, NULL), ('Fisherman Road + Chef', 7, 10, 150, NULL),
  ('Old School to New School', 2, 3, 150, NULL), ('Old School to New School', 4, 6, 140, NULL),
  ('Old School to New School', 7, 10, 130, NULL), ('Old School to New School', 11, 20, 120, NULL),
  ('Old School to New School + Chef', 2, 3, 200, NULL), ('Old School to New School + Chef', 4, 6, 175, NULL),
  ('Old School to New School + Chef', 7, 10, 165, NULL), ('Old School to New School + Chef', 11, 20, 165, NULL),
  ('Surprise Surprise Douro (Motorista DMC)', 2, 3, 400, NULL), ('Surprise Surprise Douro (Motorista DMC)', 4, 6, 375, NULL),
  ('Surprise Surprise Douro (Motorista DMC)', 7, 10, 350, NULL), ('Surprise Surprise Douro (Motorista DMC)', 11, 20, 300, NULL),
  ('Cooking Class at Barro Restaurant', 10, 15, 125, NULL), ('Cooking Class at Barro Restaurant', 16, 20, 125, NULL),
  ('Cooking Class at Capucine', 1, 2, 200, 2), ('Cooking Class at Capucine', 3, 4, 180, NULL), ('Cooking Class at Capucine', 5, 6, 160, NULL)
)
INSERT INTO service_price_tiers (service_id, year, min_pax, max_pax, price_per_pax, min_charged_pax)
SELECT s.id, 2027, v.min_pax, v.max_pax, v.price, v.min_charged
FROM v JOIN services s ON trim(s.name) = v.service_name
ON CONFLICT (service_id, year, min_pax) DO NOTHING;

-- Costs incl. VAT for 2026 and 2027 (same spreadsheet).
WITH v(service_name, year, tier_min, tier_max, item, cost_type, amount, sort_order) AS (VALUES
  ('Fisherman Road', 2026, NULL::int, NULL::int, 'Driver', 'Fixed', 210, 1),
  ('Fisherman Road', 2026, NULL, NULL, 'Guide', 'Fixed', 75, 2),
  ('Fisherman Road', 2026, NULL, NULL, 'Food', 'Variable', 75, 3),
  ('Fisherman Road + Chef', 2026, NULL, NULL, 'Driver', 'Fixed', 210, 1),
  ('Fisherman Road + Chef', 2026, NULL, NULL, 'Guide', 'Fixed', 75, 2),
  ('Fisherman Road + Chef', 2026, NULL, NULL, 'Chef', 'Fixed', 75, 3),
  ('Fisherman Road + Chef', 2026, NULL, NULL, 'Food', 'Variable', 75, 4),
  ('Fisherman Road + Chef', 2027, NULL, NULL, 'Guide', 'Fixed', 75, 1),
  ('Fisherman Road + Chef', 2027, 2, 3, 'Chef + Decor', 'Fixed', 100, 2),
  ('Fisherman Road + Chef', 2027, 4, 6, 'Chef + Decor', 'Fixed', 125, 3),
  ('Fisherman Road + Chef', 2027, 7, 10, 'Chef + Decor', 'Fixed', 150, 4),
  ('Fisherman Road + Chef', 2027, NULL, NULL, 'Food', 'Variable', 75, 5),
  ('Old School to New School', 2026, NULL, NULL, 'Guide', 'Fixed', 75, 1),
  ('Old School to New School', 2026, NULL, NULL, 'Food', 'Variable', 75, 2),
  ('Old School to New School', 2027, NULL, NULL, 'Guide', 'Fixed', 75, 1),
  ('Old School to New School', 2027, 11, 20, 'Guide', 'Fixed', 150, 2),
  ('Old School to New School', 2027, NULL, NULL, 'Food', 'Variable', 75, 3),
  ('Old School to New School + Chef', 2026, NULL, NULL, 'Guide', 'Fixed', 75, 1),
  ('Old School to New School + Chef', 2026, NULL, NULL, 'Chef', 'Fixed', 75, 2),
  ('Old School to New School + Chef', 2026, NULL, NULL, 'Food', 'Variable', 75, 3),
  ('Old School to New School + Chef', 2027, NULL, NULL, 'Guide', 'Fixed', 75, 1),
  ('Old School to New School + Chef', 2027, 11, 20, 'Guide', 'Fixed', 150, 2),
  ('Old School to New School + Chef', 2027, NULL, NULL, 'Chef', 'Fixed', 75, 3),
  ('Old School to New School + Chef', 2027, 11, 20, 'Chef', 'Fixed', 150, 4),
  ('Old School to New School + Chef', 2027, NULL, NULL, 'Food', 'Variable', 75, 5),
  ('Surprise Surprise Douro (Motorista COME)', 2026, NULL, NULL, 'Driver', 'Fixed', 300, 1),
  ('Surprise Surprise Douro (Motorista COME)', 2026, NULL, NULL, 'Guide', 'Fixed', 150, 2),
  ('Surprise Surprise Douro (Motorista COME)', 2026, NULL, NULL, 'Boat', 'Variable', 120, 3),
  ('Surprise Surprise Douro (Motorista COME)', 2026, NULL, NULL, 'Food', 'Variable', 100, 4),
  ('Surprise Surprise Douro (Motorista COME)', 2026, NULL, NULL, 'Visits', 'Variable', 65, 5),
  ('Surprise Surprise Douro (Motorista DMC)', 2026, NULL, NULL, 'Guide', 'Fixed', 150, 1),
  ('Surprise Surprise Douro (Motorista DMC)', 2026, 2, 3, 'Boat', 'Fixed', 165, 2),
  ('Surprise Surprise Douro (Motorista DMC)', 2026, 4, 6, 'Boat', 'Fixed', 300, 3),
  ('Surprise Surprise Douro (Motorista DMC)', 2026, 7, 10, 'Boat', 'Fixed', 500, 4),
  ('Surprise Surprise Douro (Motorista DMC)', 2026, NULL, NULL, 'Food', 'Variable', 100, 5),
  ('Surprise Surprise Douro (Motorista DMC)', 2026, NULL, NULL, 'Visits', 'Variable', 65, 6),
  ('Surprise Surprise Douro (Motorista DMC)', 2027, NULL, NULL, 'Guide', 'Fixed', 150, 1),
  ('Surprise Surprise Douro (Motorista DMC)', 2027, 2, 3, 'Boat', 'Fixed', 165, 2),
  ('Surprise Surprise Douro (Motorista DMC)', 2027, 4, 6, 'Boat', 'Fixed', 300, 3),
  ('Surprise Surprise Douro (Motorista DMC)', 2027, 7, 10, 'Boat', 'Fixed', 500, 4),
  ('Surprise Surprise Douro (Motorista DMC)', 2027, NULL, NULL, 'Food', 'Variable', 100, 5),
  ('Surprise Surprise Douro (Motorista DMC)', 2027, NULL, NULL, 'Visits', 'Variable', 65, 6),
  ('Cooking Class at Barro Restaurant', 2027, 10, 15, 'Guia', 'Fixed', 125, 1),
  ('Cooking Class at Barro Restaurant', 2027, 16, 20, 'Guia', 'Fixed', 250, 2),
  ('Cooking Class at Barro Restaurant', 2027, 10, 15, 'Chef', 'Fixed', 350, 3),
  ('Cooking Class at Barro Restaurant', 2027, 16, 20, 'Chef', 'Fixed', 500, 4),
  ('Cooking Class at Barro Restaurant', 2027, NULL, NULL, 'Wine', 'Variable', 10, 5),
  ('Cooking Class at Barro Restaurant', 2027, NULL, NULL, 'Food', 'Variable', 10, 6),
  ('Cooking Class at Capucine', 2027, 1, 2, 'Course', 'Fixed', 140, 1),
  ('Cooking Class at Capucine', 2027, 3, 4, 'Course', 'Fixed', 180, 2),
  ('Cooking Class at Capucine', 2027, 5, 6, 'Course', 'Fixed', 230, 3),
  ('Cooking Class at Capucine', 2027, NULL, NULL, 'Space Rental', 'Fixed', 80, 4),
  ('Cooking Class at Capucine', 2027, NULL, NULL, 'Guia', 'Fixed', 75, 5),
  ('Cooking Class at Capucine', 2027, NULL, NULL, 'Vinhos', 'Variable', 10, 6),
  ('Cooking Class at Capucine', 2027, NULL, NULL, 'Food Cost', 'Variable', 10, 7)
)
INSERT INTO service_costs (service_id, year, tier_min, tier_max, item, cost_type, amount, sort_order)
SELECT s.id, v.year, v.tier_min, v.tier_max, v.item, v.cost_type, v.amount, v.sort_order
FROM v JOIN services s ON trim(s.name) = v.service_name
WHERE NOT EXISTS (SELECT 1 FROM service_costs c WHERE c.service_id = s.id);
