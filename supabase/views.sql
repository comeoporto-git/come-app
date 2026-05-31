-- Run this in Supabase SQL Editor to create all computed views

CREATE OR REPLACE VIEW sales_computed AS
WITH sale_transactions AS (
  SELECT
    sale_id,
    SUM(CASE WHEN type = 'Earning' THEN valor ELSE 0 END) AS faturacao,
    SUM(CASE WHEN type = 'Expense' THEN valor ELSE 0 END) AS custo
  FROM transactions
  WHERE sale_id IS NOT NULL
  GROUP BY sale_id
)
SELECT
  s.*,
  CASE
    WHEN s.number_of_guests >= 7 THEN sv.pax_7_plus
    WHEN s.number_of_guests >= 4 THEN sv.pax_4_6
    WHEN s.number_of_guests >= 2 THEN sv.pax_2_3
    WHEN s.number_of_guests =  1 THEN sv.pax_2_3 * 2
    ELSE 0
  END AS preco_unitario,
  CASE
    WHEN s.number_of_guests >= 7 THEN sv.pax_7_plus * s.number_of_guests
    WHEN s.number_of_guests >= 4 THEN sv.pax_4_6    * s.number_of_guests
    WHEN s.number_of_guests >= 2 THEN sv.pax_2_3    * s.number_of_guests
    WHEN s.number_of_guests =  1 THEN sv.pax_2_3    * 2
    ELSE 0
  END AS preco_servico,
  CASE
    WHEN s.number_of_guests >= 7 THEN sv.pax_7_plus * s.number_of_guests * 1.23
    WHEN s.number_of_guests >= 4 THEN sv.pax_4_6    * s.number_of_guests * 1.23
    WHEN s.number_of_guests >= 2 THEN sv.pax_2_3    * s.number_of_guests * 1.23
    WHEN s.number_of_guests =  1 THEN sv.pax_2_3    * 2                  * 1.23
    ELSE 0
  END AS preco_servico_iva,
  COALESCE(st.faturacao, 0) AS faturacao,
  COALESCE(st.custo, 0) AS custo,
  COALESCE(st.faturacao, 0) + COALESCE(st.custo, 0) AS lucro_tour,
  CASE WHEN COALESCE(st.faturacao, 0) <> 0
    THEN (COALESCE(st.faturacao, 0) + COALESCE(st.custo, 0)) / st.faturacao
    ELSE 0
  END AS pct_lucro,
  CASE WHEN COALESCE(s.number_of_guests, 0) > 0
    THEN COALESCE(st.custo, 0) / s.number_of_guests
    ELSE 0
  END AS custo_por_pax,
  CASE WHEN COALESCE(s.number_of_guests, 0) > 0
    THEN (COALESCE(st.faturacao, 0) + COALESCE(st.custo, 0)) / s.number_of_guests
    ELSE 0
  END AS lucro_por_pax
FROM sales s
LEFT JOIN services sv ON sv.id = s.service_id
LEFT JOIN sale_transactions st ON st.sale_id = s.id;


CREATE OR REPLACE VIEW transactions_with_sale AS
SELECT
  t.*,
  s.status AS sale_status,
  s.date   AS sale_date,
  s.type   AS sale_type
FROM transactions t
LEFT JOIN sales s ON s.id = t.sale_id;


CREATE OR REPLACE VIEW team_computed AS
SELECT
  t.*,
  COALESCE((
    SELECT SUM(tr.valor) FROM transactions tr WHERE tr.team_id = t.id
  ), 0) AS total_transactions
FROM team t;


CREATE OR REPLACE VIEW fornecedores_computed AS
SELECT
  f.*,
  COALESCE((
    SELECT SUM(t.valor) FROM transactions t WHERE t.fornecedor_id = f.id
  ), 0) AS total_transactions
FROM fornecedores f;


CREATE OR REPLACE VIEW clients_computed AS
SELECT
  c.*,
  COALESCE((
    SELECT SUM(t.valor) FROM transactions t WHERE t.client_id = c.id
  ), 0) AS faturacao
FROM clients c;
