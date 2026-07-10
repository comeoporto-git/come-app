-- Third pass on orphaned supplier transactions (see the two prior
-- link_*_orphaned_supplier* migrations). Only handles the confident cases:
-- clear one-off local vendors, names that are already-linked team members
-- under a different label, and "Anthropic" merging into the existing
-- "Anthropic, PBC" fornecedor. Deliberately leaves out the "Vinho ..."
-- cluster, a handful of non-vendor-looking labels, and unconfirmed person
-- names — those need a human call, not a guess.

-- ── Team members under a different label ───────────────────────────────────

UPDATE transactions
SET team_id = (SELECT id FROM team WHERE name ILIKE 'Miguel Cerqueira' LIMIT 1)
WHERE notion_id = 'Miguel Cerqueira' AND team_id IS NULL
  AND EXISTS (SELECT 1 FROM team WHERE name ILIKE 'Miguel Cerqueira');

UPDATE transactions
SET team_id = (SELECT id FROM team WHERE name ILIKE 'Miguel Rocha' LIMIT 1)
WHERE notion_id = 'Miguel Rocha' AND team_id IS NULL
  AND EXISTS (SELECT 1 FROM team WHERE name ILIKE 'Miguel Rocha');

UPDATE transactions
SET team_id = (SELECT id FROM team WHERE name ILIKE 'Guilherme Gaspar' LIMIT 1)
WHERE notion_id = 'Guilherme Gaspar' AND team_id IS NULL
  AND EXISTS (SELECT 1 FROM team WHERE name ILIKE 'Guilherme Gaspar');

UPDATE transactions
SET team_id = (SELECT id FROM team WHERE name ILIKE 'João Tomé' LIMIT 1)
WHERE notion_id = 'João Tomé' AND team_id IS NULL
  AND EXISTS (SELECT 1 FROM team WHERE name ILIKE 'João Tomé');

UPDATE transactions
SET team_id = (SELECT id FROM team WHERE name ILIKE 'Francisca Passos' LIMIT 1)
WHERE notion_id = 'Food Cost - Francisca Passos' AND team_id IS NULL
  AND EXISTS (SELECT 1 FROM team WHERE name ILIKE 'Francisca Passos');

-- ── Merge "Anthropic" into the existing "Anthropic, PBC" fornecedor ────────

UPDATE transactions
SET fornecedor_id = (SELECT id FROM fornecedores WHERE name = 'Anthropic, PBC')
WHERE notion_id = 'Anthropic' AND fornecedor_id IS NULL;

-- ── New fornecedores: confident one-off local vendors ──────────────────────

INSERT INTO fornecedores (id, name)
SELECT gen_random_uuid(), v.name
FROM (VALUES
  ('Mira Ramos Supermercado'), ('Fabrica da Nata - Sao Bento'), ('Fabrica da Nata'),
  ('Petroprix'), ('Muro'), ('Kaiji'), ('Tradição Prod. a Granel'),
  ('O Sitio dos Cogumelos'), ('Galp'), ('Tio Pepe 1'), ('Tio Pepe 2'),
  ('Escama'), ('Caves Tirsense'), ('Pastelaria A Tendinha'), ('Alves Bandeira'),
  ('Praia Bar - Pinhão'), ('Salta o Muro'), ('Gazela'),
  ('Tinoco e Filhos - Decoração'), ('Clever'),
  ('Fabrica Igreja Paroquial Freguesia St. Ildefonso'), ('A J & Barros, Lda.'),
  ('Tasquinha dos Guindais'), ('Salitre'), ('Bilhetes Jantar Bolhão'),
  ('Padaria Confeitaria Neta 3'), ('Flores - Decoração'), ('Taxi'),
  ('Uber - Bernardo')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM fornecedores f WHERE f.name = v.name);

UPDATE transactions t
SET fornecedor_id = f.id
FROM fornecedores f
WHERE t.notion_id = f.name
  AND t.fornecedor_id IS NULL
  AND t.notion_id IN (
    'Mira Ramos Supermercado', 'Fabrica da Nata - Sao Bento', 'Fabrica da Nata',
    'Petroprix', 'Muro', 'Kaiji', 'Tradição Prod. a Granel',
    'O Sitio dos Cogumelos', 'Galp', 'Tio Pepe 1', 'Tio Pepe 2',
    'Escama', 'Caves Tirsense', 'Pastelaria A Tendinha', 'Alves Bandeira',
    'Praia Bar - Pinhão', 'Salta o Muro', 'Gazela',
    'Tinoco e Filhos - Decoração', 'Clever',
    'Fabrica Igreja Paroquial Freguesia St. Ildefonso', 'A J & Barros, Lda.',
    'Tasquinha dos Guindais', 'Salitre', 'Bilhetes Jantar Bolhão',
    'Padaria Confeitaria Neta 3', 'Flores - Decoração', 'Taxi', 'Uber - Bernardo'
  );

-- ── Verification: what's still unlinked (should now only be the flagged items) ──

SELECT notion_id, COUNT(*) AS remaining_unlinked
FROM transactions
WHERE fornecedor_id IS NULL AND client_id IS NULL AND team_id IS NULL
  AND notion_id IS NOT NULL AND notion_id != '' AND NOT notion_id ILIKE 'IN -%'
  AND NOT notion_id ILIKE 'OUT - %'
GROUP BY notion_id
ORDER BY remaining_unlinked DESC;
