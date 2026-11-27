-- Child prices.
--
-- A booking records how many of its people are children by age band:
--   10-18 pay 75%, 3-9 pay 50%, 0-2 are free.
-- number_of_guests is still everyone, children included, and picks the tier;
-- each child pays their share of that tier's price. A tier's minimum charge
-- (e.g. Capucine 1-2 = 2) tops up missing people at the full price.
-- The same rates live in src/lib/pricing.ts (CHILD_RATES).

ALTER TABLE sales ADD COLUMN IF NOT EXISTS children_10_18 int NOT NULL DEFAULT 0 CHECK (children_10_18 >= 0);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS children_3_9   int NOT NULL DEFAULT 0 CHECK (children_3_9 >= 0);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS children_0_2   int NOT NULL DEFAULT 0 CHECK (children_0_2 >= 0);

-- The function gains arguments, so the view that calls it is rebuilt around it.
DROP VIEW IF EXISTS sales_computed;
DROP FUNCTION IF EXISTS sale_pricing(uuid, date, int, text);

CREATE OR REPLACE FUNCTION sale_pricing(
  p_service_id uuid,
  p_date date,
  p_guests int,
  p_vehicle text,
  p_children_10_18 int DEFAULT 0,
  p_children_3_9 int DEFAULT 0,
  p_children_0_2 int DEFAULT 0
)
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
      (SELECT 1 AS pri, t.* FROM tiers t
        WHERE COALESCE(p_guests, 0) BETWEEN t.min_pax AND COALESCE(t.max_pax, 2147483647)
        ORDER BY t.min_pax LIMIT 1)
      UNION ALL
      (SELECT 2, t.* FROM tiers t
        WHERE COALESCE(p_guests, 0) < t.min_pax
        ORDER BY t.min_pax LIMIT 1)
      UNION ALL
      (SELECT 3, t.* FROM tiers t ORDER BY t.min_pax DESC LIMIT 1)
    ) x ORDER BY pri LIMIT 1
  ),
  people AS (
    -- children can't outnumber the group; the oldest band is counted first
    SELECT g, c1018, c39, LEAST(COALESCE(p_children_0_2, 0), g - c1018 - c39) AS c02
    FROM (
      SELECT g, c1018, LEAST(COALESCE(p_children_3_9, 0), g - c1018) AS c39
      FROM (
        SELECT g, LEAST(COALESCE(p_children_10_18, 0), g) AS c1018
        FROM (SELECT GREATEST(COALESCE(p_guests, 0), 0) AS g) a
      ) b
    ) c
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
    CASE WHEN people.g <= 0 THEN 0
         ELSE GREATEST(people.g, COALESCE(tier.min_charged_pax, 0)) END,
    CASE WHEN people.g <= 0 THEN 0
         ELSE tier.price_per_pax * (
           (people.g - people.c1018 - people.c39 - people.c02)
           + people.c1018 * 0.75
           + people.c39 * 0.5
           + GREATEST(COALESCE(tier.min_charged_pax, 0) - people.g, 0)
         ) END,
    COALESCE((SELECT price FROM transport), 0)
  FROM people
  LEFT JOIN tier ON true;
$$;

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
LEFT JOIN LATERAL sale_pricing(s.service_id, s.date, s.number_of_guests, s.transport_vehicle,
                               s.children_10_18, s.children_3_9, s.children_0_2) p ON true
LEFT JOIN sale_transactions st ON st.sale_id = s.id;

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
  FROM sale_pricing(NEW.service_id, NEW.date, NEW.number_of_guests, NEW.transport_vehicle,
                    NEW.children_10_18, NEW.children_3_9, NEW.children_0_2) p;

  INSERT INTO transactions (notion_id, data, conta_pagamento, type, valor, sale_id, client_id)
  VALUES ('IN - ' || COALESCE(NEW.notion_id, ''), NEW.date, 'COME', 'Earning',
          COALESCE(v_total, 0), NEW.id, NEW.client_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Changing the transport or the children on a booking moves its earning (IN-)
-- by the difference in price (+23% VAT), keeping any manual edits to the rest
-- of the amount. Bookings already Invoiced or Paid are left alone.
CREATE OR REPLACE FUNCTION adjust_earning_for_transport()
RETURNS TRIGGER AS $$
DECLARE
  v_old   NUMERIC;
  v_new   NUMERIC;
  v_delta NUMERIC;
BEGIN
  IF NEW.transport_vehicle IS NOT DISTINCT FROM OLD.transport_vehicle
     AND NEW.children_10_18 IS NOT DISTINCT FROM OLD.children_10_18
     AND NEW.children_3_9   IS NOT DISTINCT FROM OLD.children_3_9
     AND NEW.children_0_2   IS NOT DISTINCT FROM OLD.children_0_2 THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('Invoiced', 'Paid') THEN
    RETURN NEW;
  END IF;

  -- Only the transport and the children changes are billed here; the old
  -- figure uses the new group size and service so other edits don't leak in.
  SELECT COALESCE(p.service_total, 0) + COALESCE(p.transport_total, 0) INTO v_old
  FROM sale_pricing(NEW.service_id, NEW.date, NEW.number_of_guests, OLD.transport_vehicle,
                    OLD.children_10_18, OLD.children_3_9, OLD.children_0_2) p;
  SELECT COALESCE(p.service_total, 0) + COALESCE(p.transport_total, 0) INTO v_new
  FROM sale_pricing(NEW.service_id, NEW.date, NEW.number_of_guests, NEW.transport_vehicle,
                    NEW.children_10_18, NEW.children_3_9, NEW.children_0_2) p;

  v_delta := (COALESCE(v_new, 0) - COALESCE(v_old, 0)) * 1.23;
  IF v_delta <> 0 THEN
    UPDATE transactions
    SET valor = COALESCE(valor, 0) + v_delta
    WHERE id = (
      SELECT id FROM transactions
      WHERE sale_id = NEW.id AND type = 'Earning'
      ORDER BY created_at
      LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_adjust_earning_for_transport ON sales;
CREATE TRIGGER trigger_adjust_earning_for_transport
  AFTER UPDATE OF transport_vehicle, children_10_18, children_3_9, children_0_2 ON sales
  FOR EACH ROW
  EXECUTE FUNCTION adjust_earning_for_transport();
