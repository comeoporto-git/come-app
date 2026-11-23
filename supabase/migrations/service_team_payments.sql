-- Team payments per service and year, by the service's own group sizes.
--
-- service_prices had fixed Chef 2-3 / 4-6 / 7-10, Copa and Driver columns,
-- which don't fit services priced at 10-15 / 16-20 or 11-20. Each payment is
-- now a line: role, amount, and a group-size range (NULL = every group), like
-- service_costs. service_prices stays for history but is no longer read.

CREATE TABLE IF NOT EXISTS service_team_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  year        int  NOT NULL,
  role        text NOT NULL,
  tier_min    int,
  tier_max    int,
  amount      numeric NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_team_payments_service_year_idx ON service_team_payments(service_id, year);
ALTER TABLE service_team_payments ENABLE ROW LEVEL SECURITY;

-- Existing values. The old chef columns map onto that year's 2-3 / 4-6 / 7+
-- tiers (1-3, 4-6, 7+ for 2026); three equal chef values become one line for
-- every group.
WITH sp AS (
  SELECT * FROM service_prices
  WHERE NOT EXISTS (SELECT 1 FROM service_team_payments p WHERE p.service_id = service_prices.service_id AND p.year = service_prices.year)
),
tier_for AS (
  -- tier holding a representative group size for each old column
  SELECT sp.service_id, sp.year, g.col, g.ord,
         t.min_pax, t.max_pax
  FROM sp
  CROSS JOIN (VALUES ('chef_2_3', 2, 1), ('chef_4_6', 5, 2), ('chef_7_10', 8, 3)) g(col, pax, ord)
  LEFT JOIN LATERAL (
    SELECT min_pax, max_pax FROM service_price_tiers t
    WHERE t.service_id = sp.service_id AND t.year = sp.year
      AND g.pax BETWEEN t.min_pax AND COALESCE(t.max_pax, 2147483647)
    ORDER BY t.min_pax LIMIT 1
  ) t ON true
),
lines AS (
  -- chef, same amount for every group
  SELECT sp.service_id, sp.year, 'Chef' AS role, NULL::int AS tier_min, NULL::int AS tier_max, sp.valor_chef_2_3 AS amount, 1 AS ord
  FROM sp
  WHERE sp.valor_chef_2_3 IS NOT NULL
    AND sp.valor_chef_2_3 = sp.valor_chef_4_6 AND sp.valor_chef_4_6 = sp.valor_chef_7_10
  UNION ALL
  -- chef by tier
  SELECT sp.service_id, sp.year, 'Chef', tf.min_pax, tf.max_pax,
         CASE tf.col WHEN 'chef_2_3' THEN sp.valor_chef_2_3 WHEN 'chef_4_6' THEN sp.valor_chef_4_6 ELSE sp.valor_chef_7_10 END,
         tf.ord
  FROM sp JOIN tier_for tf ON tf.service_id = sp.service_id AND tf.year = sp.year
  WHERE NOT (sp.valor_chef_2_3 IS NOT NULL AND sp.valor_chef_2_3 = sp.valor_chef_4_6 AND sp.valor_chef_4_6 = sp.valor_chef_7_10)
    AND tf.min_pax IS NOT NULL
    AND CASE tf.col WHEN 'chef_2_3' THEN sp.valor_chef_2_3 WHEN 'chef_4_6' THEN sp.valor_chef_4_6 ELSE sp.valor_chef_7_10 END IS NOT NULL
  UNION ALL
  SELECT sp.service_id, sp.year, 'Copa', NULL, NULL, sp.valor_copa, 4 FROM sp WHERE sp.valor_copa IS NOT NULL
  UNION ALL
  SELECT sp.service_id, sp.year, 'Driver', NULL, NULL, sp.valor_driver, 5 FROM sp WHERE sp.valor_driver IS NOT NULL
)
INSERT INTO service_team_payments (service_id, year, role, tier_min, tier_max, amount, sort_order)
SELECT service_id, year, role, tier_min, tier_max, amount, ord FROM lines;

-- 2027 additions from the Service Pricing Calculator spreadsheet:
-- a second chef for Old School + Chef groups of 11-20, and the Barro chef.
WITH v(service_name, role, tier_min, tier_max, amount, sort_order) AS (VALUES
  ('Old School to New School + Chef', 'Chef', 11, 20, 150, 2),
  ('Cooking Class at Barro Restaurant', 'Chef', 10, 15, 350, 1),
  ('Cooking Class at Barro Restaurant', 'Chef', 16, 20, 500, 2)
)
INSERT INTO service_team_payments (service_id, year, role, tier_min, tier_max, amount, sort_order)
SELECT s.id, 2027, v.role, v.tier_min, v.tier_max, v.amount, v.sort_order
FROM v JOIN services s ON trim(s.name) = v.service_name
WHERE NOT EXISTS (
  SELECT 1 FROM service_team_payments p
  WHERE p.service_id = s.id AND p.year = 2027 AND p.role = v.role AND p.tier_min = v.tier_min
);
