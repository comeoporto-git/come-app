-- Event quotes (orçamentos de eventos)
--
-- supplier_items        what each supplier rents/sells and its current price (excl. VAT)
-- supplier_item_prices  every price a supplier quoted us, so price changes are visible
-- event_quotes          a quote for one event, or a template (is_template) reused for
--                       repeated events; linked to a service of type 'Evento'
-- event_quote_lines     the cost lines of a quote; per person or fixed quantity
--
-- Seed: Amado and Mesa Posta prices from their quotes in Gmail (Sep 2025 – Oct 2026)
-- and Mesa Posta catalogue prices noted in the OODA planning doc (Nov 2025).

CREATE TABLE IF NOT EXISTS supplier_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id  uuid NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  name           text NOT NULL,
  category       text NOT NULL DEFAULT 'Outros',
  -- Same value on equivalent items of different suppliers (e.g. 'Prato ladeiro')
  -- so the catalogue can show which supplier is cheaper.
  compare_key    text,
  unit           text NOT NULL DEFAULT 'un',
  unit_price     numeric,              -- excl. VAT; NULL = ask for a price
  vat_rate       numeric NOT NULL DEFAULT 0.23,
  price_date     date,
  source         text,
  url            text,
  notes          text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fornecedor_id, name)
);
CREATE INDEX IF NOT EXISTS supplier_items_fornecedor_idx ON supplier_items(fornecedor_id);
ALTER TABLE supplier_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS supplier_item_prices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES supplier_items(id) ON DELETE CASCADE,
  unit_price  numeric NOT NULL,
  quoted_on   date NOT NULL,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, quoted_on, unit_price)
);
CREATE INDEX IF NOT EXISTS supplier_item_prices_item_idx ON supplier_item_prices(item_id, quoted_on);
ALTER TABLE supplier_item_prices ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS event_quotes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  is_template             boolean NOT NULL DEFAULT false,
  status                  text NOT NULL DEFAULT 'Rascunho'
                          CHECK (status IN ('Rascunho', 'Enviado', 'Aceite', 'Recusado')),
  service_id              uuid REFERENCES services(id) ON DELETE SET NULL,
  client_id               uuid REFERENCES clients(id) ON DELETE SET NULL,
  sale_id                 uuid REFERENCES sales(id) ON DELETE SET NULL,
  template_id             uuid REFERENCES event_quotes(id) ON DELETE SET NULL,
  event_date              date,
  guests                  int NOT NULL DEFAULT 20 CHECK (guests >= 0),
  location                text,
  markup_pct              numeric NOT NULL DEFAULT 40,
  price_per_pax_override  numeric,       -- final price per person excl. VAT, rounded by hand
  vat_rate                numeric NOT NULL DEFAULT 0.23,
  notes                   text,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_quotes_service_idx ON event_quotes(service_id);
CREATE INDEX IF NOT EXISTS event_quotes_template_idx ON event_quotes(is_template, updated_at DESC);
ALTER TABLE event_quotes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS event_quote_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          uuid NOT NULL REFERENCES event_quotes(id) ON DELETE CASCADE,
  sort_order        int NOT NULL DEFAULT 0,
  category          text NOT NULL DEFAULT 'Outros',
  description       text NOT NULL,
  supplier_item_id  uuid REFERENCES supplier_items(id) ON DELETE SET NULL,
  fornecedor_id     uuid REFERENCES fornecedores(id) ON DELETE SET NULL,
  qty_mode          text NOT NULL DEFAULT 'per_pax' CHECK (qty_mode IN ('per_pax', 'fixed')),
  quantity          numeric NOT NULL DEFAULT 1,  -- per person, or total when fixed
  unit_cost         numeric NOT NULL DEFAULT 0,  -- excl. VAT
  vat_rate          numeric NOT NULL DEFAULT 0.23,
  notes             text
);
CREATE INDEX IF NOT EXISTS event_quote_lines_quote_idx ON event_quote_lines(quote_id, sort_order);
ALTER TABLE event_quote_lines ENABLE ROW LEVEL SECURITY;

-- ── Seed: supplier prices ───────────────────────────────────────────────────
-- (supplier, item, category, compare_key, unit_price, quoted_on, source, url)

CREATE TEMP TABLE _supplier_price_seed AS
SELECT * FROM (VALUES
  -- Amado · Gmail quotes
  ('Amado', 'Cadeiras madeira mogno', 'Mobiliário', 'Cadeira de madeira', 3.50, DATE '2025-09-16', 'Gmail · 22 Setembro - Lavra', 'https://www.amado.pt/aluguer/cadeira-madeira/'),
  ('Amado', 'Cadeiras madeira mogno', 'Mobiliário', 'Cadeira de madeira', 3.30, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/cadeira-madeira/'),
  ('Amado', 'Cadeiras madeira mogno', 'Mobiliário', 'Cadeira de madeira', 3.30, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/cadeira-madeira/'),
  ('Amado', 'Coxins bege', 'Mobiliário', 'Coxim', 1.00, DATE '2025-09-16', 'Gmail · 22 Setembro - Lavra', 'https://www.amado.pt/aluguer/coxim-para-cadeira-copia/'),
  ('Amado', 'Coxins bege', 'Mobiliário', 'Coxim', 0.80, DATE '2026-09-22', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Mesa de madeira retangular', 'Mobiliário', NULL, 30.00, DATE '2025-09-16', 'Gmail · 22 Setembro - Lavra', 'https://www.amado.pt/aluguer/mesa-de-madeira-retangular/'),
  ('Amado', 'Mesas retangulares 1.90 x 0.80', 'Mobiliário', 'Mesa retangular ~1,80m', 14.00, DATE '2026-09-22', 'Gmail · 03 Outubro - Angeiras', 'https://www.amado.pt/aluguer/mesa-retangular-1-90-x-0-80/'),
  ('Amado', 'Mesas retangulares 1.90 x 0.80', 'Mobiliário', 'Mesa retangular ~1,80m', 14.00, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/mesa-retangular-1-90-x-0-80/'),
  ('Amado', 'Mesas corridas baviera (10 pax)', 'Mobiliário', NULL, 25.00, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/mesas-corridas/'),
  ('Amado', 'Mesa em PVC', 'Mobiliário', NULL, 15.00, DATE '2026-09-30', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Guarda-sol de madeira pano cru c/ base', 'Exterior', NULL, 45.00, DATE '2025-09-16', 'Gmail · 22 Setembro - Lavra', 'https://www.amado.pt/aluguer/guarda-sol/'),
  ('Amado', 'Guarda-sol de madeira pano cru c/ base', 'Exterior', NULL, 45.00, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/guarda-sol/'),
  ('Amado', 'Tenda cónica branca 2x2', 'Exterior', NULL, 180.00, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/tendas-02-x-02/'),
  ('Amado', 'Toalhas retangulares em algodão', 'Têxteis', 'Toalha retangular', 8.50, DATE '2026-09-22', 'Gmail · 03 Outubro - Angeiras', 'https://www.amado.pt/aluguer/toalha-de-mesa-branca/'),
  ('Amado', 'Toalhas retangulares em algodão', 'Têxteis', 'Toalha retangular', 8.50, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/toalha-de-mesa-branca/'),
  ('Amado', 'Saiotes (cor a escolher)', 'Têxteis', NULL, 8.00, DATE '2026-09-22', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Guardanapos branco hotel', 'Têxteis', 'Guardanapo branco', 0.75, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/guardanapo-branco-hotel/'),
  ('Amado', 'Guardanapos branco hotel', 'Têxteis', 'Guardanapo branco', 0.75, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/guardanapo-branco-hotel/'),
  ('Amado', 'Pratos ladeiro', 'Loiça', 'Prato ladeiro', 0.40, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/pratos-porcelana/'),
  ('Amado', 'Pratos ladeiro', 'Loiça', 'Prato ladeiro', 0.40, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/pratos-porcelana/'),
  ('Amado', 'Pratos de sobremesa', 'Loiça', 'Prato de sobremesa', 0.40, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/prato-de-sobremesa/'),
  ('Amado', 'Pratos de sobremesa', 'Loiça', 'Prato de sobremesa', 0.40, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/prato-de-sobremesa/'),
  ('Amado', 'Pratos de pão', 'Loiça', 'Prato de pão', 0.35, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/prato-de-pao/'),
  ('Amado', 'Pratos de sopa', 'Loiça', 'Prato fundo / sopa', 0.40, DATE '2026-09-30', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Chávenas café com pires + colheres', 'Loiça', 'Chávena de café', 0.60, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/chavena-cafe-com-pires/'),
  ('Amado', 'Travessas inox ovais', 'Serviço', NULL, 1.50, DATE '2026-09-30', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Bandejas redondas inox', 'Serviço', NULL, 2.00, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/bandejas-redondas/'),
  ('Amado', 'Tabuleiro gastronorm 1/1', 'Serviço', NULL, 1.60, DATE '2026-09-30', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Jarros para sumo', 'Serviço', NULL, 1.80, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/jarro-para-sumo/'),
  ('Amado', 'Facas de peixe', 'Talheres', 'Faca de peixe', 0.30, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/garfo-de-peixe/'),
  ('Amado', 'Garfos de peixe', 'Talheres', 'Garfo de peixe', 0.30, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/garfo-de-peixe/'),
  ('Amado', 'Facas de carne', 'Talheres', 'Faca de carne', 0.30, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/faca-de-carne/'),
  ('Amado', 'Garfos de carne', 'Talheres', 'Garfo de carne', 0.30, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/garfo-de-carne/'),
  ('Amado', 'Colheres de sobremesa', 'Talheres', 'Colher de sobremesa', 0.30, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/colher-de-sobremesa/'),
  ('Amado', 'Garfos de sobremesa', 'Talheres', 'Garfo de sobremesa', 0.30, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/garfo-de-sobremesa/'),
  ('Amado', 'Facas de sobremesa', 'Talheres', 'Faca de sobremesa', 0.30, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/faca-de-sobremesa/'),
  ('Amado', 'Colheres de sopa', 'Talheres', NULL, 0.30, DATE '2026-09-30', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Colheres de chá', 'Talheres', NULL, 0.15, DATE '2026-09-30', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Colheres de café', 'Talheres', 'Colher de café', 0.15, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/colher-de-cafe/'),
  ('Amado', 'Copos de água sem pé', 'Copos', 'Copo de água', 0.50, DATE '2025-11-27', 'Gmail · 28 Novembro - Porto', 'https://www.amado.pt/aluguer/copo-de-agua-sem-pe/'),
  ('Amado', 'Copos de água sem pé', 'Copos', 'Copo de água', 0.50, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/copo-de-agua-sem-pe/'),
  ('Amado', 'Copos de vinho Riedel', 'Copos', 'Copo de vinho', 0.50, DATE '2025-10-27', 'Gmail · 29 Outubro', 'https://www.amado.pt/aluguer/copo-vinho-degustacao-riedel/'),
  ('Amado', 'Copos de vinho Riedel', 'Copos', 'Copo de vinho', 0.50, DATE '2025-12-02', 'Gmail · 4 Dezembro', 'https://www.amado.pt/aluguer/copo-vinho-degustacao-riedel/'),
  ('Amado', 'Copos de vinho Riedel', 'Copos', 'Copo de vinho', 0.60, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/copo-vinho-degustacao-riedel/'),
  ('Amado', 'Copos de vinho Riedel', 'Copos', 'Copo de vinho', 0.60, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/copo-vinho-degustacao-riedel/'),
  ('Amado', 'Copos de vinho Schott Zwiesel', 'Copos', NULL, 0.50, DATE '2025-12-02', 'Gmail · 4 Dezembro', 'https://www.amado.pt/aluguer/copo-de-vinho-reserva/'),
  ('Amado', 'Copos de vinho Schott Zwiesel', 'Copos', NULL, 0.60, DATE '2026-10-12', 'Gmail · 14 Outubro', 'https://www.amado.pt/aluguer/copo-de-vinho-reserva/'),
  ('Amado', 'Copos vinho do Porto Siza Vieira', 'Copos', NULL, 0.50, DATE '2025-12-02', 'Gmail · 4 Dezembro', 'https://www.amado.pt/aluguer/copo-de-vinho-do-porto-siza-vieira/'),
  ('Amado', 'Copos vinho do Porto Siza Vieira', 'Copos', NULL, 0.60, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', 'https://www.amado.pt/aluguer/copo-de-vinho-do-porto-siza-vieira/'),
  ('Amado', 'Copos de vinho do Porto', 'Copos', 'Copo de vinho do Porto', 0.40, DATE '2025-10-27', 'Gmail · 29 Outubro', 'https://www.amado.pt/aluguer/copo-de-vinho-do-porto/'),
  ('Amado', 'Copos de vinho do Porto', 'Copos', 'Copo de vinho do Porto', 0.35, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/copo-de-vinho-do-porto/'),
  ('Amado', 'Copos de sumo', 'Copos', NULL, 0.25, DATE '2026-06-11', 'Gmail · 28 Junho - Santa Maria de Avioso', 'https://www.amado.pt/aluguer/copo-de-sumo/'),
  ('Amado', 'Placa de indução', 'Equipamento', NULL, 30.00, DATE '2026-09-30', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Extintor', 'Equipamento', NULL, 12.50, DATE '2026-09-22', 'Gmail · 03 Outubro - Angeiras', NULL),
  ('Amado', 'Transporte entrega + recolha (Porto)', 'Transporte', 'Transporte', 120.00, DATE '2025-11-21', 'Gmail · 28 Novembro - Porto', NULL),
  ('Amado', 'Transporte entrega + recolha (Angeiras)', 'Transporte', 'Transporte', 130.00, DATE '2026-10-21', 'Gmail · 23 Outubro - Angeiras', NULL),

  -- Mesa Posta · Gmail quotes nº102481 (Nov 2025) and nº109046 (Jun 2026)
  ('Mesa Posta', 'Mesa retangular 1,80m (tampo + cavaletes)', 'Mobiliário', 'Mesa retangular ~1,80m', 9.50, DATE '2025-11-25', 'Gmail · Orçamento nº102481', 'https://www.mesaposta.com/produto/aluguer_de_mesas_e_cadeiras_esplanada_congressos/_mesa_rect_1_80m_x_0_75m_c_cavalete/103'),
  ('Mesa Posta', 'Mesa retangular 1,80m (tampo + cavaletes)', 'Mobiliário', 'Mesa retangular ~1,80m', 9.50, DATE '2026-06-23', 'Gmail · Orçamento nº109046', 'https://www.mesaposta.com/produto/aluguer_de_mesas_e_cadeiras_esplanada_congressos/_mesa_rect_1_80m_x_0_75m_c_cavalete/103'),
  ('Mesa Posta', 'Cadeira madeira mel', 'Mobiliário', 'Cadeira de madeira', 2.50, DATE '2025-11-25', 'Gmail · Orçamento nº102481', 'https://www.mesaposta.com/produto/aluguer_de_mesas_e_cadeiras_esplanada_congressos/_cadeira_madeira_mel/106'),
  ('Mesa Posta', 'Cadeira madeira mel', 'Mobiliário', 'Cadeira de madeira', 2.50, DATE '2026-06-23', 'Gmail · Orçamento nº109046', 'https://www.mesaposta.com/produto/aluguer_de_mesas_e_cadeiras_esplanada_congressos/_cadeira_madeira_mel/106'),
  ('Mesa Posta', 'Aquecedor cogumelo a gás 2,25m (sem gás)', 'Exterior', 'Aquecedor a gás', 45.00, DATE '2025-11-25', 'Gmail · Orçamento nº102481', 'https://www.mesaposta.com/produto/aluguer_de_mesas_e_cadeiras_esplanada_congressos/a555_quecedor_cogumelo_a_gas_para_esplanada_alt_2_/797'),
  ('Mesa Posta', 'Garrafa de gás propano 8,5–11 kg', 'Exterior', NULL, 45.00, DATE '2025-11-25', 'Gmail · Orçamento nº102481 gás', NULL),
  ('Mesa Posta', 'Manta polar grey esplanada 2x1,30m', 'Exterior', NULL, 3.00, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Guardanapo branco', 'Têxteis', 'Guardanapo branco', 0.60, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Guardanapo branco', 'Têxteis', 'Guardanapo branco', 0.60, DATE '2026-06-23', 'Gmail · Orçamento nº109046', NULL),
  ('Mesa Posta', 'Prato raso/ladeiro 26,5 cm', 'Loiça', 'Prato ladeiro', 0.30, DATE '2025-11-25', 'Gmail · Orçamento nº102481', 'https://www.mesaposta.com/produto/aluguer_de_loucas/_prato_raso_ladeiro_26_5_cm_mult_25/1'),
  ('Mesa Posta', 'Prato raso/ladeiro 26,5 cm', 'Loiça', 'Prato ladeiro', 0.30, DATE '2026-06-23', 'Gmail · Orçamento nº109046', 'https://www.mesaposta.com/produto/aluguer_de_loucas/_prato_raso_ladeiro_26_5_cm_mult_25/1'),
  ('Mesa Posta', 'Prato fundo redondo liso 23 cm', 'Loiça', 'Prato fundo / sopa', 0.30, DATE '2025-11-25', 'Gmail · Orçamento nº102481', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_fundo_liso_23_cm_mult_25/4'),
  ('Mesa Posta', 'Prato sobremesa 21 cm', 'Loiça', 'Prato de sobremesa', 0.30, DATE '2025-11-25', 'Gmail · Orçamento nº102481', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_sobremesa_21_cm_mult_25/2'),
  ('Mesa Posta', 'Prato sobremesa 21 cm', 'Loiça', 'Prato de sobremesa', 0.30, DATE '2026-06-23', 'Gmail · Orçamento nº109046', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_sobremesa_21_cm_mult_25/2'),
  ('Mesa Posta', 'Prato a pão em vidro', 'Loiça', 'Prato de pão', 0.28, DATE '2025-11-25', 'Gmail · Orçamento nº102481', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_a_pao_em_vidro_mult_25/753'),
  ('Mesa Posta', 'Chávena de café', 'Loiça', 'Chávena de café', 0.25, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Pires de café', 'Loiça', NULL, 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Faca de carne Platino', 'Talheres', 'Faca de carne', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Garfo de carne Platino', 'Talheres', 'Garfo de carne', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Faca de peixe Platino', 'Talheres', 'Faca de peixe', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Garfo de peixe Platino', 'Talheres', 'Garfo de peixe', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Colher de sobremesa Platino', 'Talheres', 'Colher de sobremesa', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Garfo de sobremesa Platino', 'Talheres', 'Garfo de sobremesa', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Faca de sobremesa Platino', 'Talheres', 'Faca de sobremesa', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Colher de café Platino', 'Talheres', 'Colher de café', 0.20, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Faca de peixe Sublime', 'Talheres', NULL, 0.30, DATE '2026-06-23', 'Gmail · Orçamento nº109046', NULL),
  ('Mesa Posta', 'Garfo de peixe Sublime', 'Talheres', NULL, 0.30, DATE '2026-06-23', 'Gmail · Orçamento nº109046', NULL),
  ('Mesa Posta', 'Colher de sobremesa Sublime', 'Talheres', NULL, 0.30, DATE '2026-06-23', 'Gmail · Orçamento nº109046', NULL),
  ('Mesa Posta', 'Caneca regional 1,5L', 'Serviço', NULL, 3.00, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Glaciar de inox grande', 'Serviço', NULL, 8.00, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Bidão 25L c/ torneira', 'Serviço', NULL, 3.00, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Deslocação 800–1500 kg ida/volta (máx. 25 km)', 'Transporte', 'Transporte', 110.00, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Quilómetro (deslocação)', 'Transporte', NULL, 0.70, DATE '2025-11-25', 'Gmail · Orçamento nº102481', NULL),
  ('Mesa Posta', 'Quilómetro (deslocação)', 'Transporte', NULL, 0.80, DATE '2026-06-23', 'Gmail · Orçamento nº109046', NULL),
  ('Mesa Posta', 'Piquete fora de horas', 'Transporte', NULL, 90.00, DATE '2025-11-28', 'Gmail · Orçamento nº102733', NULL),

  -- Mesa Posta · catalogue prices noted in the OODA planning doc (Drive, Nov 2025)
  ('Mesa Posta', 'Prato a pão 16,5 cm', 'Loiça', NULL, 0.28, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_a_pao_16_5_cm_mult_25/3'),
  ('Mesa Posta', 'Prato a pão Escorial 16,5 cm', 'Loiça', NULL, 0.33, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_a_pao_escorial_16_5cm_mult_25/729'),
  ('Mesa Posta', 'Prato sobremesa Escorial 21 cm', 'Loiça', NULL, 0.35, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_sobremesa_escorial_21cm_mult_25/622'),
  ('Mesa Posta', 'Prato fundo Escorial 23 cm', 'Loiça', NULL, 0.35, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_fundo_escorial_23cm_mult_25/625'),
  ('Mesa Posta', 'Prato Exuberant grés preto risca 23 cm', 'Loiça', NULL, 1.50, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/_prato_exuberant_em_gres_preto_risca_23cm_mult_25/690'),
  ('Mesa Posta', 'Prato fundo ovalizado gourmet', 'Loiça', NULL, 1.00, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_fundo_ovalisado_gourmet_mult_20/582'),
  ('Mesa Posta', 'Prato marcador Elegance 29 cm', 'Loiça', NULL, 2.50, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_marcador_elegance_29cm_mult_20_/1027'),
  ('Mesa Posta', 'Prato marcador Exuberante riscado grés 33 cm', 'Loiça', NULL, 2.50, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_marcador_exuberante_riscado_gres_33cm_mult_2/902'),
  ('Mesa Posta', 'Prato ladeiro Churchill mostarda 26 cm', 'Loiça', NULL, 3.00, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_ladeiro_churchill_mostarda_26cm_mult_15_/1022'),
  ('Mesa Posta', 'Prato ladeiro Dudson green 27,5 cm', 'Loiça', NULL, 4.00, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_ladeiro_dudson_green_27_5cm_mult15_/1019'),
  ('Mesa Posta', 'Taça mini sabores aspiral', 'Loiça', NULL, 0.60, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/taca_mini_sabores_aspiral_11_d12cm/911'),
  ('Mesa Posta', 'Prato oval cocktail Elegance 20 cm', 'Loiça', NULL, 0.90, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_loucas/prato_oval_cocktail_elegance_20cm/918'),
  ('Mesa Posta', 'Toalha retangular 1,60 x 2,60 alinhada', 'Têxteis', 'Toalha retangular', 10.00, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_toalhas_de_mesa_/toalha_rect_1_60_x_2_60_alinhada/825'),
  ('Mesa Posta', 'Toalha Milão lisa branca brilho ~2,20m', 'Têxteis', NULL, 8.00, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_toalhas_de_mesa_/_toalha_milao_lisa_branca_brilho_rect_aprox_2_20m_/573'),
  ('Mesa Posta', 'Guardanapo Sublime', 'Têxteis', NULL, 0.65, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_toalhas_de_mesa_/_guardanapo_sublime/214'),
  ('Mesa Posta', 'Aquecedor cilíndrico a gás (sem gás)', 'Exterior', 'Aquecedor a gás', 35.00, DATE '2025-11-19', 'Drive · OODA (site)', 'https://www.mesaposta.com/produto/aluguer_de_mesas_e_cadeiras_esplanada_congressos/a493_aquecedor_de_esplanada_cilindrico_a_gas_n_inc/659'),
  ('Mesa Posta', 'Copo neutro sem pé Sublime 440ml', 'Copos', 'Copo de água', 0.50, DATE '2025-10-07', 'Drive · OODA orçamento (site)', 'https://www.mesaposta.com/produto/aluguer_de_copos_e_acessorios_servico_de_bebidas_/_copo_neutro_sem_pe_sublime_440ml_mult_25/736')
) AS v(supplier, name, category, compare_key, price, quoted_on, source, url);

INSERT INTO supplier_items (fornecedor_id, name, category, compare_key, unit_price, price_date, source, url)
SELECT f.id, l.name, l.category, l.compare_key, l.price, l.quoted_on, l.source, l.url
FROM (SELECT DISTINCT ON (supplier, name) * FROM _supplier_price_seed ORDER BY supplier, name, quoted_on DESC) l
JOIN fornecedores f ON f.name = l.supplier
ON CONFLICT (fornecedor_id, name) DO NOTHING;

INSERT INTO supplier_item_prices (item_id, unit_price, quoted_on, source)
SELECT si.id, v.price, v.quoted_on, v.source
FROM _supplier_price_seed v
JOIN fornecedores f ON f.name = v.supplier
JOIN supplier_items si ON si.fornecedor_id = f.id AND si.name = v.name
ON CONFLICT (item_id, quoted_on, unit_price) DO NOTHING;
DROP TABLE _supplier_price_seed;
