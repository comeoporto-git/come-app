-- Sync clients → sales_pipeline. Every booking client should also exist as a
-- CRM account (stage 'Client'), so it shows up in /admin/crm/clients and its
-- account page doesn't 404. Two client-creation code paths already write to
-- `clients` directly without touching `sales_pipeline` (come-app's "+ Serviço"
-- form and the Gmail add-on's sale importer, in a separate repo) — enforcing
-- this at the DB level means any future caller is covered automatically,
-- instead of needing every app to remember the mirror insert.

-- Backfill: create a matching sales_pipeline row for any existing client that
-- doesn't have one yet (id-based match, safe to re-run).
INSERT INTO sales_pipeline (id, name, email, phone_number, stage)
SELECT c.id, c.name, c.email, c.phone, 'Client'
FROM clients c
LEFT JOIN sales_pipeline sp ON sp.id = c.id
WHERE sp.id IS NULL;

-- Going forward: auto-create the sales_pipeline row whenever a client row is
-- inserted, regardless of which app or script does the insert.
CREATE OR REPLACE FUNCTION sync_client_to_pipeline() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sales_pipeline (id, name, email, phone_number, stage)
  VALUES (NEW.id, NEW.name, NEW.email, NEW.phone, 'Client')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_client_to_pipeline ON clients;
CREATE TRIGGER trg_sync_client_to_pipeline
AFTER INSERT ON clients
FOR EACH ROW
EXECUTE FUNCTION sync_client_to_pipeline();
