-- COME App — Notion → Supabase schema
-- Notion page IDs are kept as primary keys (UUID format) so all FK relations migrate automatically.

-- =====================================================================
-- INDEPENDENT TABLES (no FK dependencies)
-- =====================================================================

CREATE TABLE IF NOT EXISTS team (
  id                   UUID PRIMARY KEY,
  name                 TEXT NOT NULL,
  email                TEXT,
  contact              TEXT,
  role                 TEXT,
  categoria            TEXT,
  source               TEXT,
  iban                 TEXT,
  numero_contribuinte  TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id               UUID PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT,
  equipa           TEXT[],
  valor_chef_2_3   NUMERIC,
  valor_chef_4_6   NUMERIC,
  valor_chef_7_10  NUMERIC,
  valor_copa       NUMERIC,
  valor_driver     NUMERIC,
  pax_2_3          NUMERIC,
  pax_4_6          NUMERIC,
  pax_7_plus       NUMERIC,
  processo         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id             UUID PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  nif            TEXT,
  nome_fiscal    TEXT,
  morada_fiscal  TEXT,
  source         TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  contact       TEXT,
  iban          TEXT,
  contribuinte  TEXT,
  categoria     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- SALES (depends on team, services, clients)
-- =====================================================================

CREATE TABLE IF NOT EXISTS sales (
  id                UUID PRIMARY KEY,
  notion_id         TEXT,
  date              DATE,
  type              TEXT,
  status            TEXT,
  number_of_guests  INTEGER,
  names             TEXT,
  meeting_point     TEXT,
  notes             TEXT,
  phone_number      TEXT,
  email_link        TEXT,
  driver_type       TEXT,
  expenses_closed   TEXT,
  gcal_event_id     TEXT,
  synced_at         DATE,
  thread_ids        TEXT,
  service_id        UUID REFERENCES services(id),
  client_id         UUID REFERENCES clients(id),
  guide_id          UUID REFERENCES team(id),
  chef_id           UUID REFERENCES team(id),
  driver_id         UUID REFERENCES team(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Additional team members on a sale (🧑🏼‍🍳 Team — many-to-many)
CREATE TABLE IF NOT EXISTS sales_team (
  sale_id   UUID REFERENCES sales(id) ON DELETE CASCADE,
  team_id   UUID REFERENCES team(id) ON DELETE CASCADE,
  PRIMARY KEY (sale_id, team_id)
);

-- =====================================================================
-- TRANSACTIONS (depends on sales, fornecedores, clients, team)
-- =====================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id                         UUID PRIMARY KEY,
  notion_id                  TEXT,
  valor                      NUMERIC,
  valor_sem_iva              NUMERIC,
  iva_6                      NUMERIC,
  iva_13                     NUMERIC,
  iva_23                     NUMERIC,
  data                       DATE,
  data_transferencia         DATE,
  type                       TEXT,
  status                     TEXT,
  status_fatura              TEXT,
  pago_por                   TEXT,
  metodo_pagamento           TEXT,
  conta_pagamento            TEXT,
  precisa_fatura             TEXT,
  pagamento_ao_fornecedor    TEXT,
  fatura_sem_saida_direta    TEXT,
  transferencia_feita        BOOLEAN DEFAULT FALSE,
  validado_contabilidade     BOOLEAN DEFAULT FALSE,
  id_banco                   TEXT,
  id_fatura                  TEXT,
  fatura_url                 TEXT,
  comprovativo_url           TEXT,
  sale_id                    UUID REFERENCES sales(id),
  fornecedor_id              UUID REFERENCES fornecedores(id),
  client_id                  UUID REFERENCES clients(id),
  team_id                    UUID REFERENCES team(id),
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- CLOTHING (no relations)
-- =====================================================================

CREATE TABLE IF NOT EXISTS clothing (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  categoria   TEXT,
  quantidade  NUMERIC,
  cor         TEXT,
  desenho     TEXT,
  tamanho     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- BUSINESS RULES (no relations)
-- =====================================================================

CREATE TABLE IF NOT EXISTS business_rules (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  value      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- SALES PIPELINE + ACTIVITIES (CRM)
-- No circular FK constraints — tasks.sales_pipeline_id captures the link
-- =====================================================================

CREATE TABLE IF NOT EXISTS sales_pipeline (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  pessoa        TEXT,
  email         TEXT,
  phone_number  TEXT,
  website       TEXT,
  sales_status  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_activities (
  id                UUID PRIMARY KEY,
  activitie         TEXT NOT NULL,
  description       TEXT,
  thread_link       TEXT,
  date              DATE,
  sales_pipeline_id UUID REFERENCES sales_pipeline(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- SOCIAL MEDIA PLANNER (depends on team)
-- =====================================================================

CREATE TABLE IF NOT EXISTS social_media_planner (
  id            UUID PRIMARY KEY,
  post_name     TEXT NOT NULL,
  copy          TEXT,
  post_date     DATE,
  post_url      TEXT,
  platform      TEXT[],
  content_type  TEXT[],
  status        TEXT,
  file_url      TEXT,
  owner_id      UUID REFERENCES team(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TASKS (depends on team, sales, transactions, social_media_planner, sales_pipeline)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id                  UUID PRIMARY KEY,
  name                TEXT NOT NULL,
  task_description    TEXT,
  status              TEXT,
  priority            TEXT,
  categoria           TEXT[],
  due_date            DATE,
  file_url            TEXT,
  team_member_id      UUID REFERENCES team(id),
  sale_id             UUID REFERENCES sales(id),
  transaction_id      UUID REFERENCES transactions(id),
  social_media_id     UUID REFERENCES social_media_planner(id),
  sales_pipeline_id   UUID REFERENCES sales_pipeline(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- VIEWS — replace all Notion formulas and rollups
-- =====================================================================

-- SALES: all computed fields
-- Preço Unitário  = tier price from linked service (pax 1 → pax_2_3×2, 2-3 → pax_2_3, 4-6 → pax_4_6, 7+ → pax_7_plus)
-- Preço Serviço   = Preço Unitário × number_of_guests
-- Preço Serviço + IVA = Preço Serviço × 1.23
-- Faturação       = SUM(earnings transactions)
-- Custo           = SUM(expense transactions)  — expenses stored as negative values
-- Lucro Tour      = Faturação + Custo  (earnings + negative expenses = net profit)
-- % Lucro         = Lucro Tour / Faturação
-- Custo / Pax     = Custo / number_of_guests
-- Lucro / Pax     = Lucro Tour / number_of_guests
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
  END                                                                          AS preco_unitario,
  CASE
    WHEN s.number_of_guests >= 7 THEN sv.pax_7_plus * s.number_of_guests
    WHEN s.number_of_guests >= 4 THEN sv.pax_4_6    * s.number_of_guests
    WHEN s.number_of_guests >= 2 THEN sv.pax_2_3    * s.number_of_guests
    WHEN s.number_of_guests =  1 THEN sv.pax_2_3    * 2
    ELSE 0
  END                                                                          AS preco_servico,
  CASE
    WHEN s.number_of_guests >= 7 THEN sv.pax_7_plus * s.number_of_guests * 1.23
    WHEN s.number_of_guests >= 4 THEN sv.pax_4_6    * s.number_of_guests * 1.23
    WHEN s.number_of_guests >= 2 THEN sv.pax_2_3    * s.number_of_guests * 1.23
    WHEN s.number_of_guests =  1 THEN sv.pax_2_3    * 2                  * 1.23
    ELSE 0
  END                                                                          AS preco_servico_iva,
  COALESCE(st.faturacao, 0)                                                   AS faturacao,
  COALESCE(st.custo, 0)                                                       AS custo,
  COALESCE(st.faturacao, 0) + COALESCE(st.custo, 0)                          AS lucro_tour,
  CASE WHEN COALESCE(st.faturacao, 0) <> 0
    THEN (COALESCE(st.faturacao, 0) + COALESCE(st.custo, 0)) / st.faturacao
    ELSE 0
  END                                                                          AS pct_lucro,
  CASE WHEN COALESCE(s.number_of_guests, 0) > 0
    THEN COALESCE(st.custo, 0) / s.number_of_guests
    ELSE 0
  END                                                                          AS custo_por_pax,
  CASE WHEN COALESCE(s.number_of_guests, 0) > 0
    THEN (COALESCE(st.faturacao, 0) + COALESCE(st.custo, 0)) / s.number_of_guests
    ELSE 0
  END                                                                          AS lucro_por_pax
FROM sales s
LEFT JOIN services sv ON sv.id = s.service_id
LEFT JOIN sale_transactions st ON st.sale_id = s.id;


-- TRANSACTIONS: rollups from linked sale (replaces "Status - Serviço", "✅ Tarefas", "Preço Serviço + IVA" rollups)
CREATE OR REPLACE VIEW transactions_with_sale AS
SELECT
  t.*,
  s.status AS sale_status,
  s.date   AS sale_date,
  s.type   AS sale_type
FROM transactions t
LEFT JOIN sales s ON s.id = t.sale_id;


-- TEAM: total value of all linked transactions (replaces the "Formula" field)
CREATE OR REPLACE VIEW team_computed AS
SELECT
  t.*,
  COALESCE((
    SELECT SUM(tr.valor) FROM transactions tr WHERE tr.team_id = t.id
  ), 0) AS total_transactions
FROM team t;


-- FORNECEDORES: total spend across all linked transactions (replaces "Formula" field)
CREATE OR REPLACE VIEW fornecedores_computed AS
SELECT
  f.*,
  COALESCE((
    SELECT SUM(t.valor) FROM transactions t WHERE t.fornecedor_id = f.id
  ), 0) AS total_transactions
FROM fornecedores f;


-- CLIENTS: total billing from all linked transactions (replaces "Faturação" formula)
CREATE OR REPLACE VIEW clients_computed AS
SELECT
  c.*,
  COALESCE((
    SELECT SUM(t.valor) FROM transactions t WHERE t.client_id = c.id
  ), 0) AS faturacao
FROM clients c;
