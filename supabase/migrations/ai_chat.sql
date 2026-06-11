-- AI Chat persistence: conversations and messages

CREATE TABLE IF NOT EXISTS ai_chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_chat_conversations_user_idx
  ON ai_chat_conversations(user_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_chat_messages_conv_idx
  ON ai_chat_messages(conversation_id, created_at ASC);

-- Auto-bump updated_at on conversation when a message is inserted
CREATE OR REPLACE FUNCTION bump_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ai_chat_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_conversation ON ai_chat_messages;
CREATE TRIGGER trg_bump_conversation
  AFTER INSERT ON ai_chat_messages
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_updated_at();
