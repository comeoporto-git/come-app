-- The sync_clients_to_pipeline migration's blanket backfill pulled in known
-- junk/technical/test client rows (see scripts/import-clients-to-crm.ts's
-- original SKIP list) as if they were real "Client" CRM accounts — e.g.
-- "notion2gcal", a placeholder used by the old Notion/Calendar sync bot.
-- Add the same exclusion here so the trigger stops doing this going forward,
-- and clean up the sales_pipeline rows already created for them.

CREATE OR REPLACE FUNCTION sync_client_to_pipeline() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS NULL OR trim(NEW.name) = '' OR NEW.name IN (
    'Teste', 'Teste123', 'Website', 'notion2gcal', 'E1315', 'Anthropic, PBC'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO sales_pipeline (id, name, email, phone_number, stage)
  VALUES (NEW.id, NEW.name, NEW.email, NEW.phone, 'Client')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove the CRM (sales_pipeline) rows already created for these junk clients.
-- Leaves the underlying `clients` rows untouched — some are still referenced
-- by real historical sales/transactions and must not be deleted.
DELETE FROM sales_pipeline sp
USING clients c
WHERE sp.id = c.id
  AND c.name IN ('Teste', 'Teste123', 'Website', 'notion2gcal', 'E1315', 'Anthropic, PBC');
