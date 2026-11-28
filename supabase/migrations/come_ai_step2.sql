-- COME AI passo 2.
-- 1) As conversas do antigo chat do Social passam para o COME AI.
INSERT INTO ai_chat_conversations (id, user_email, title, created_at, updated_at)
SELECT c.id, c.user_email, 'Social: ' || coalesce(c.title, 'conversa'), c.created_at, c.updated_at
FROM social_chat_conversations c
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_conversations a WHERE a.id = c.id);
INSERT INTO ai_chat_messages (id, conversation_id, role, content, created_at)
SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
FROM social_chat_messages m
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_messages a WHERE a.id = m.id);

-- 2) Conversas ligadas a um email ou a uma venda: ao abrir o COME AI nesse
--    email/venda, continua a mesma conversa ("thread:<id>" / "sale:<id>").
ALTER TABLE ai_chat_conversations ADD COLUMN IF NOT EXISTS context_key text;
ALTER TABLE ai_chat_conversations ADD COLUMN IF NOT EXISTS context_label text;
CREATE INDEX IF NOT EXISTS ai_chat_conversations_context_idx ON ai_chat_conversations(user_email, context_key);
