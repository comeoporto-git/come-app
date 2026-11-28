-- COME AI: o que a equipa diz no chat sobre uma conversa de email fica aqui e
-- entra em todas as análises seguintes dessa conversa (resposta, venda, tarefas).
ALTER TABLE inbox_threads ADD COLUMN IF NOT EXISTS team_notes text;
