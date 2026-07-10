-- Transactions can carry a free-text supplier label (notion_id column) that
-- was never resolved to a real fornecedor_id/team_id — the exact-string-match
-- lookup in EditExpenseModal silently skips linking when the typed text
-- doesn't match an existing name exactly (spelling variants, accents, or the
-- record not existing yet at entry time). This links the confirmed cases.

-- ── Team members: Luis Pimenta spelling variants ───────────────────────────

WITH luis_team AS (
  SELECT DISTINCT team_id FROM transactions
  WHERE notion_id = 'Luis Pimenta' AND team_id IS NOT NULL
  LIMIT 1
)
UPDATE transactions
SET team_id = (SELECT team_id FROM luis_team)
WHERE notion_id IN ('Luís Pimenta', 'Luis Manuel Pimenta Martins Barbosa e Silva')
  AND team_id IS NULL
  AND (SELECT team_id FROM luis_team) IS NOT NULL;

-- João Lello — link to existing team member by name, if one exists
UPDATE transactions
SET team_id = (SELECT id FROM team WHERE name ILIKE 'João Lello' LIMIT 1)
WHERE notion_id = 'João Lello'
  AND team_id IS NULL
  AND EXISTS (SELECT 1 FROM team WHERE name ILIKE 'João Lello');

-- ── Fornecedores: create missing records, then link transactions ──────────

INSERT INTO fornecedores (id, name)
SELECT gen_random_uuid(), v.name
FROM (VALUES
  ('Crédito Agrícola'),
  ('Casa Alfredo'),
  ('Lobo do Mar'),
  ('Restaurante do Clube de Leça'),
  ('Pingo Doce'),
  ('Casa Louro'),
  ('República dos Cachorros'),
  ('Tia Caia'),
  ('Instituto dos Registos e do Notariado, I.P.')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM fornecedores f WHERE f.name = v.name);

UPDATE transactions t
SET fornecedor_id = f.id
FROM fornecedores f
WHERE t.notion_id = f.name
  AND t.fornecedor_id IS NULL
  AND t.notion_id IN (
    'Crédito Agrícola', 'Casa Alfredo', 'Lobo do Mar', 'Restaurante do Clube de Leça',
    'Pingo Doce', 'Casa Louro', 'República dos Cachorros', 'Tia Caia',
    'Instituto dos Registos e do Notariado, I.P.'
  );

-- The specific Anthropic, PBC transaction found earlier (invoice AI970TYD-0004)
UPDATE transactions
SET fornecedor_id = (SELECT id FROM fornecedores WHERE name = 'Anthropic, PBC')
WHERE id = 'd35b23c4-def6-4b1c-a18a-bff91b577c76';

-- "OUT - COME 21/23", "OUT - Bernardo 21/28/49" are internal transfer labels,
-- not vendors — deliberately left untouched.

-- ── Verification ────────────────────────────────────────────────────────────

SELECT notion_id, COUNT(*) AS remaining_unlinked
FROM transactions
WHERE fornecedor_id IS NULL AND client_id IS NULL AND team_id IS NULL
  AND notion_id IS NOT NULL AND notion_id != '' AND NOT notion_id ILIKE 'IN -%'
GROUP BY notion_id
ORDER BY remaining_unlinked DESC;
