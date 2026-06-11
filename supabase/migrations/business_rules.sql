-- Business rules — key/value config table consumed by AI chat and app logic

CREATE TABLE IF NOT EXISTS business_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO business_rules (key, value, description) VALUES
  ('max_services_per_day',   '2',  'Número máximo de serviços ativos por dia'),
  ('prospect_stale_days',    '30', 'Dias sem contacto antes de um prospect ser considerado inativo (CRM alert)'),
  ('tour_max_guests',        '20', 'Número máximo de convidados por tour (default)'),
  ('booking_lead_days',      '1',  'Mínimo de dias de antecedência para aceitar reservas'),
  ('expenses_close_days',    '7',  'Dias após o tour para fechar despesas'),
  ('invoice_due_days',       '30', 'Prazo padrão de pagamento de faturas a clientes (dias)')
ON CONFLICT (key) DO NOTHING;

-- Auto-update updated_at on change
CREATE OR REPLACE FUNCTION set_business_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_rules_updated_at ON business_rules;
CREATE TRIGGER trg_business_rules_updated_at
  BEFORE UPDATE ON business_rules
  FOR EACH ROW EXECUTE FUNCTION set_business_rules_updated_at();
