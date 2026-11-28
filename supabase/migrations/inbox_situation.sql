-- Ponto de situação de cada conversa (estado, combinado, falta, próximo passo,
-- de quem se espera), reescrito a cada mensagem nova — nossa ou do cliente.
ALTER TABLE inbox_threads ADD COLUMN IF NOT EXISTS situation jsonb;
