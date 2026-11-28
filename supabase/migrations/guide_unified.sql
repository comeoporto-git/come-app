-- Um só guia: o Guia da empresa passa a ser a única fonte de instruções da AI
-- (Caixa de Entrada, COME AI, legendas e pontuação de fotos, chat do Social).
-- O Brand Brief do Social é importado para a secção "Marca e redes sociais".
-- Conflitos entre regras ficam em guide_conflicts até alguém decidir.

INSERT INTO company_guide (section, title, content, source)
SELECT 'Marca e redes sociais', v.title, v.content, 'manual'
FROM social_brand_brief b,
LATERAL (VALUES
  ('Tom de voz', b.tone),
  ('O que vendemos', b.offerings),
  ('Público', b.audience),
  ('Sobre o negócio', b.website_summary),
  ('Diretrizes de redes sociais', b.guidelines)
) AS v(title, content)
WHERE b.id = '00000000-0000-0000-0000-000000000001'
  AND coalesce(trim(v.content), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM company_guide g WHERE g.title = v.title AND g.section = 'Marca e redes sociais');

-- Regras que estavam escritas no código das legendas.
INSERT INTO company_guide (section, title, content, source)
SELECT 'Marca e redes sociais', v.title, v.content, 'manual'
FROM (VALUES
  ('Legendas sem emojis', 'As legendas do Instagram nunca usam emojis (nem bandeiras). Para separar línguas usa-se uma linha "---".'),
  ('Legendas bilingues completas', 'Quando a legenda é bilingue, a mensagem completa aparece em cada língua (não só um resumo numa delas). Se as diretrizes dão várias opções, usar sempre a mesma (a primeira).')
) AS v(title, content)
WHERE NOT EXISTS (SELECT 1 FROM company_guide g WHERE g.title = v.title);

CREATE TABLE IF NOT EXISTS guide_conflicts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_ids         uuid[] NOT NULL,
  summary           text NOT NULL,
  proposed_section  text,
  proposed_title    text,
  proposed_content  text,
  -- pending | resolved | dismissed
  status            text NOT NULL DEFAULT 'pending',
  resolution        text,
  decided_by        text,
  decided_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guide_conflicts_status_idx ON guide_conflicts(status, created_at DESC);
ALTER TABLE guide_conflicts ENABLE ROW LEVEL SECURITY;

-- Quando foi feita a última verificação de conflitos (a página do Guia corre-a
-- sozinha se nunca correu ou se passou uma semana).
ALTER TABLE inbox_settings ADD COLUMN IF NOT EXISTS guide_checked_at timestamptz;
