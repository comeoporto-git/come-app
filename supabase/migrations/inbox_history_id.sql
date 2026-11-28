-- Leituras incrementais: guarda o historyId do Gmail para a próxima leitura pedir
-- só o que mudou. Limpa os erros de quota/esquema das leituras anteriores.
ALTER TABLE inbox_settings ADD COLUMN IF NOT EXISTS last_history_id text;
UPDATE inbox_threads SET error = NULL, error_message_id = NULL, error_attempts = 0
WHERE error ILIKE '%quota%' OR error ILIKE '%union types%' OR error ILIKE '%rate%limit%';
