-- Caixa de Entrada com AI (Inbox agent)
--
-- inbox_threads      one row per Gmail thread the agent has looked at: which tour
--                    (sale) it belongs to, whether it still needs a reply, and the
--                    AI's reading of it.
-- inbox_suggestions  everything the agent proposes — a reply, a new sale, changes to
--                    a sale, an expense from an invoice, a new guide entry. Nothing
--                    is sent or written until a person accepts it (aceitar / rejeitar
--                    / alterar). Also used by the AI Chat to propose actions.
-- company_guide      the company guide the agent writes and rewrites as it learns
--                    from every accepted, edited or rejected suggestion. Read by the
--                    inbox agent and by the AI Chat.
-- inbox_settings     single row: whose Google account the inbox uses and when it
--                    last synced.

CREATE TABLE IF NOT EXISTS inbox_threads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_thread_id    text NOT NULL UNIQUE,
  subject            text,
  from_name          text,
  from_email         text,
  snippet            text,
  last_message_id    text,
  last_message_at    timestamptz,
  last_from_us       boolean NOT NULL DEFAULT false,
  message_count      integer NOT NULL DEFAULT 0,
  -- needs_reply | awaiting_approval | replied | no_reply | done
  status             text NOT NULL DEFAULT 'needs_reply',
  -- booking_request | booking_change | question | invoice | supplier | internal | other
  category           text,
  summary            text,
  language           text,
  sale_id            uuid REFERENCES sales(id) ON DELETE SET NULL,
  client_id          uuid REFERENCES clients(id) ON DELETE SET NULL,
  analysis           jsonb,
  analyzed_message_id text,
  analyzed_at        timestamptz,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_threads_status_idx ON inbox_threads(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS inbox_threads_sale_idx ON inbox_threads(sale_id);
ALTER TABLE inbox_threads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inbox_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid REFERENCES inbox_threads(id) ON DELETE CASCADE,
  sale_id         uuid REFERENCES sales(id) ON DELETE SET NULL,
  -- reply | create_sale | update_sale | add_expense | guide_entry
  kind            text NOT NULL,
  title           text NOT NULL,
  rationale       text,
  payload         jsonb NOT NULL,
  -- pending | accepted | modified | rejected | superseded | failed
  status          text NOT NULL DEFAULT 'pending',
  final_payload   jsonb,
  feedback        text,
  result          jsonb,
  error           text,
  -- inbox | chat
  source          text NOT NULL DEFAULT 'inbox',
  for_message_id  text,
  decided_by      text,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_suggestions_thread_idx ON inbox_suggestions(thread_id, created_at);
CREATE INDEX IF NOT EXISTS inbox_suggestions_status_idx ON inbox_suggestions(status, created_at DESC);
ALTER TABLE inbox_suggestions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS company_guide (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Respostas | Preços | Disponibilidade | Serviços | Clientes | Despesas | Processos
  section       text NOT NULL DEFAULT 'Processos',
  title         text NOT NULL,
  content       text NOT NULL,
  -- manual | learned
  source        text NOT NULL DEFAULT 'manual',
  source_suggestion_id uuid REFERENCES inbox_suggestions(id) ON DELETE SET NULL,
  active        boolean NOT NULL DEFAULT true,
  times_applied integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_guide_section_idx ON company_guide(section, active);
ALTER TABLE company_guide ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inbox_settings (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  owner_user_id   text,
  owner_email     text,
  calendar_id     text NOT NULL DEFAULT 'primary',
  gmail_query     text NOT NULL DEFAULT 'in:inbox newer_than:30d -category:promotions -category:social',
  last_synced_at  timestamptz,
  last_sync_error text
);
INSERT INTO inbox_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE inbox_settings ENABLE ROW LEVEL SECURITY;

-- Starting guide: what the team told us. The agent adds to it as it learns.
INSERT INTO company_guide (section, title, content, source)
SELECT * FROM (VALUES
  ('Disponibilidade', 'Férias do Bernardo',
   'No calendário, os eventos cujo título começa por "OUT" ou "out" são dias em que o Bernardo não está disponível. Nesses dias outros guias podem estar disponíveis — propor o serviço com outro guia em vez de recusar.', 'manual'),
  ('Respostas', 'Nada é enviado sem aprovação',
   'Todas as respostas, vendas, alterações e despesas são sugestões. Só são executadas depois de aceites por um administrador.', 'manual'),
  ('Preços', 'Tabela de preços nas propostas',
   'Quando o cliente pede preço ou disponibilidade, a resposta inclui uma tabela com o preço proposto calculado a partir da tabela de preços da app (preço por pessoa, total sem IVA, IVA e total com IVA).', 'manual'),
  ('Serviços', 'Informação em falta',
   'Para cada serviço confirmado é preciso: cliente, nº de pessoas, nomes, contacto, restrições alimentares, mobilidade, contacto de emergência e notas. Pedir ao cliente o que faltar, de forma simpática, numa única pergunta agrupada.', 'manual'),

  -- Estilo das respostas, a partir da análise dos emails enviados (set–nov 2026).
  ('Respostas', 'Curto e direto',
   'Respostas de 3 a 5 linhas. Um cumprimento rápido ("Espero que esteja tudo bem" / "Hope you are doing well") e logo ao assunto. Sem frases de cortesia longas, sem vender em excesso, sem emojis. Entusiasmo só quando há motivo ("Obrigado pelo pedido! Ficámos entusiasmados!").', 'manual'),
  ('Respostas', 'Não repetir perguntas já respondidas',
   'Ler a conversa toda antes de responder. Nunca voltar a pedir algo que o cliente já disse (nº de pessoas, idades, datas, alergias). Se o cliente já deu o nº de pessoas, enviar logo o preço.', 'manual'),
  ('Respostas', 'Confirmar uma reserva',
   'Ao confirmar, repetir numa frase a data, o nº de pessoas, o serviço e o horário (ex.: "Confirmo a reserva para dia 2 de setembro, 2 pax, tour Old School to New School + Chef, das 11h00 às 15h00."). A seguir pedir o ponto de encontro, eventuais restrições alimentares/de mobilidade e um contacto do cliente.', 'manual'),
  ('Disponibilidade', 'Propor alternativa em vez de recusar',
   'Se a data ou hora pedida não estiver livre, propor a alternativa mais próxima disponível ("We can offer this tour on the 26th of May, would this work for you?") em vez de só dizer que não há disponibilidade.', 'manual'),
  ('Respostas', 'Tratamento e língua',
   'Responder na língua de quem escreve. Agências portuguesas: "Bom dia/Olá [nome]" e tratar por "tu" contactos habituais. Agências estrangeiras: inglês, "Hi [nome]"; a agências espanholas "Hola [nome]". Clientes diretos: "Hello [nome]" / "Olá [nome]". Fornecedores: "Boa tarde," e pedidos objetivos.', 'manual'),
  ('Respostas', 'Fecho e assinatura',
   'Fecho "Obrigado," (português) ou "Kind regards," (inglês). Assinatura em linhas separadas: nome completo com acentos (ex.: António Antunes), "COME Food Tours", "comeoporto.com", "RNAAT 1238/2026". Assinar com o nome de quem tem escrito nesta conversa; se ninguém escreveu ainda, Manuel Antunes.', 'manual'),
  ('Preços', 'Como apresentar preços',
   'Agências e operadores: o preço é líquido, por pessoa, sem IVA ("+ IVA"). Clientes diretos: mostrar também o total com IVA. Formato único: "200,00 €", com vírgula decimal e duas casas. Crianças: 10-18 anos 25% de desconto, 3-9 anos 50%, 0-2 grátis. Os valores vêm sempre da tabela de preços da app.', 'manual'),
  ('Respostas', 'Seguimento de propostas',
   'Se uma agência não responde a uma proposta, fazer seguimento curto ao fim de 5 dias ("Já tens resposta sobre este pedido?"), e lembrar o prazo quando a data se aproxima ("Caso seja para acontecer temos de começar a planear agora."). Se não avançar: "Ficamos à espera de outra oportunidade."', 'manual'),
  ('Serviços', 'Recomendar transporte quando há limitações',
   'Se o cliente tem limitações de mobilidade, dizer claramente o que recomendamos: as tours a pé têm muita caminhada e escadas, por isso recomendamos transporte.', 'manual')
) AS v(section, title, content, source)
WHERE NOT EXISTS (SELECT 1 FROM company_guide);
