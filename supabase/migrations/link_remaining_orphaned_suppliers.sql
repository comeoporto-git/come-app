-- Follow-up to link_orphaned_supplier_transactions.sql — the last three
-- unconfirmed supplier labels are also fornecedores.

INSERT INTO fornecedores (id, name)
SELECT gen_random_uuid(), v.name
FROM (VALUES
  ('Vinho'),
  ('Fernando Ramos & Rosa'),
  ('Uber Filo')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM fornecedores f WHERE f.name = v.name);

UPDATE transactions t
SET fornecedor_id = f.id
FROM fornecedores f
WHERE t.notion_id = f.name
  AND t.fornecedor_id IS NULL
  AND t.notion_id IN ('Vinho', 'Fernando Ramos & Rosa', 'Uber Filo');

-- Verification — should return no rows now (aside from "OUT - ..." labels,
-- which are intentionally left unlinked)
SELECT notion_id, COUNT(*) AS remaining_unlinked
FROM transactions
WHERE fornecedor_id IS NULL AND client_id IS NULL AND team_id IS NULL
  AND notion_id IS NOT NULL AND notion_id != '' AND NOT notion_id ILIKE 'IN -%'
  AND NOT notion_id ILIKE 'OUT - %'
GROUP BY notion_id
ORDER BY remaining_unlinked DESC;
