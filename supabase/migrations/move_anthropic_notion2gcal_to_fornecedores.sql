-- "Anthropic, PBC" and "notion2gcal" are vendor/service costs (API and
-- integration fees — both have only negative-value transactions and zero
-- sales), not clients. They were linked via transactions.client_id when
-- transactions.fornecedor_id is the column meant for this. Move them.

DO $$
DECLARE
  client_row RECORD;
  fid UUID;
BEGIN
  FOR client_row IN
    SELECT * FROM clients WHERE name IN ('Anthropic, PBC', 'notion2gcal')
  LOOP
    -- Find or create the matching fornecedor
    SELECT id INTO fid FROM fornecedores WHERE name = client_row.name LIMIT 1;
    IF fid IS NULL THEN
      fid := gen_random_uuid();
      INSERT INTO fornecedores (id, name, email, created_at)
      VALUES (fid, client_row.name, client_row.email, now());
    END IF;

    -- Re-point their transactions from client_id to fornecedor_id
    UPDATE transactions
    SET fornecedor_id = fid, client_id = NULL
    WHERE client_id = client_row.id;

    -- Remove the CRM mirror row, then the now-unused clients row
    DELETE FROM sales_pipeline WHERE id = client_row.id;
    DELETE FROM clients WHERE id = client_row.id;
  END LOOP;
END $$;
