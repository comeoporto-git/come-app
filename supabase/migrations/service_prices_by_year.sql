CREATE TABLE service_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  year int not null,
  pax_2_3 numeric,
  pax_4_6 numeric,
  pax_7_plus numeric,
  valor_chef_2_3 numeric,
  valor_chef_4_6 numeric,
  valor_chef_7_10 numeric,
  valor_copa numeric,
  valor_driver numeric,
  created_at timestamptz not null default now(),
  unique (service_id, year)
);
ALTER TABLE service_prices ENABLE ROW LEVEL SECURITY;

INSERT INTO service_prices (service_id, year, pax_2_3, pax_4_6, pax_7_plus, valor_chef_2_3, valor_chef_4_6, valor_chef_7_10, valor_copa, valor_driver)
SELECT id, 2026, pax_2_3, pax_4_6, pax_7_plus, valor_chef_2_3, valor_chef_4_6, valor_chef_7_10, valor_copa, valor_driver
FROM services
WHERE pax_2_3 IS NOT NULL OR pax_4_6 IS NOT NULL OR pax_7_plus IS NOT NULL
   OR valor_chef_2_3 IS NOT NULL OR valor_chef_4_6 IS NOT NULL OR valor_chef_7_10 IS NOT NULL
   OR valor_copa IS NOT NULL OR valor_driver IS NOT NULL;

-- sales_computed depended on services.pax_* directly; repoint it at the
-- per-year price closest to each sale's own year instead.
CREATE OR REPLACE VIEW sales_computed AS
WITH sale_transactions AS (
  SELECT transactions.sale_id,
    sum(CASE WHEN transactions.type = 'Earning'::text THEN transactions.valor ELSE 0::numeric END) AS faturacao,
    sum(CASE WHEN transactions.type = 'Expense'::text THEN transactions.valor ELSE 0::numeric END) AS custo
  FROM transactions
  WHERE transactions.sale_id IS NOT NULL
  GROUP BY transactions.sale_id
),
sale_price AS (
  SELECT s.id AS sale_id, sp.pax_2_3, sp.pax_4_6, sp.pax_7_plus
  FROM sales s
  LEFT JOIN LATERAL (
    SELECT sp2.pax_2_3, sp2.pax_4_6, sp2.pax_7_plus
    FROM service_prices sp2
    WHERE sp2.service_id = s.service_id
    ORDER BY abs(sp2.year - EXTRACT(YEAR FROM s.date)::int) ASC, sp2.year ASC
    LIMIT 1
  ) sp ON true
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
  CASE
    WHEN s.number_of_guests >= 7 THEN sp.pax_7_plus
    WHEN s.number_of_guests >= 4 THEN sp.pax_4_6
    WHEN s.number_of_guests >= 2 THEN sp.pax_2_3
    WHEN s.number_of_guests = 1 THEN sp.pax_2_3 * 2::numeric
    ELSE 0::numeric
  END AS preco_unitario,
  CASE
    WHEN s.number_of_guests >= 7 THEN sp.pax_7_plus * s.number_of_guests::numeric
    WHEN s.number_of_guests >= 4 THEN sp.pax_4_6 * s.number_of_guests::numeric
    WHEN s.number_of_guests >= 2 THEN sp.pax_2_3 * s.number_of_guests::numeric
    WHEN s.number_of_guests = 1 THEN sp.pax_2_3 * 2::numeric
    ELSE 0::numeric
  END AS preco_servico,
  CASE
    WHEN s.number_of_guests >= 7 THEN sp.pax_7_plus * s.number_of_guests::numeric * 1.23
    WHEN s.number_of_guests >= 4 THEN sp.pax_4_6 * s.number_of_guests::numeric * 1.23
    WHEN s.number_of_guests >= 2 THEN sp.pax_2_3 * s.number_of_guests::numeric * 1.23
    WHEN s.number_of_guests = 1 THEN sp.pax_2_3 * 2::numeric * 1.23
    ELSE 0::numeric
  END AS preco_servico_iva,
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
LEFT JOIN sale_price sp ON sp.sale_id = s.id
LEFT JOIN sale_transactions st ON st.sale_id = s.id;

ALTER TABLE services
  DROP COLUMN pax_2_3,
  DROP COLUMN pax_4_6,
  DROP COLUMN pax_7_plus,
  DROP COLUMN valor_chef_2_3,
  DROP COLUMN valor_chef_4_6,
  DROP COLUMN valor_chef_7_10,
  DROP COLUMN valor_copa,
  DROP COLUMN valor_driver;
