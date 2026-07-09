-- Revert exclude_junk_clients_from_pipeline.sql — "Website" (and possibly
-- others in that list) turned out to be real clients, not junk. Restore the
-- trigger to its original unconditional behavior, and re-create the
-- sales_pipeline rows that were deleted for all six excluded names.
--
-- Note: this restores name/email/phone/stage='Client' only. If any of those
-- sales_pipeline rows had custom CRM data (category, country, notes,
-- enrichment, assigned_to, etc.) before deletion, that specific data is not
-- recoverable — the row itself was deleted, not soft-hidden. Only the base
-- fields are reconstructed here from the clients table.

CREATE OR REPLACE FUNCTION sync_client_to_pipeline() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sales_pipeline (id, name, email, phone_number, stage)
  VALUES (NEW.id, NEW.name, NEW.email, NEW.phone, 'Client')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO sales_pipeline (id, name, email, phone_number, stage)
SELECT c.id, c.name, c.email, c.phone, 'Client'
FROM clients c
LEFT JOIN sales_pipeline sp ON sp.id = c.id
WHERE sp.id IS NULL;
