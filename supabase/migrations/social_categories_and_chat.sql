-- Social Media Post Manager — content categorization + AI social media manager chat

ALTER TABLE social_photos ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE social_posts  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_social_photos_category ON social_photos(category);
CREATE INDEX IF NOT EXISTS idx_social_posts_category ON social_posts(category);

-- Dedicated chat history for the social-media-manager assistant, scoped to
-- /admin/social — mirrors ai_chat_conversations/ai_chat_messages exactly,
-- kept as its own tables rather than sharing the general business chat's
-- tables since the system prompt/context injected is entirely different.

CREATE TABLE IF NOT EXISTS social_chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_chat_conversations_user_idx
  ON social_chat_conversations(user_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS social_chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES social_chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_chat_messages_conv_idx
  ON social_chat_messages(conversation_id, created_at ASC);

CREATE OR REPLACE FUNCTION bump_social_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE social_chat_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_social_conversation ON social_chat_messages;
CREATE TRIGGER trg_bump_social_conversation
  AFTER INSERT ON social_chat_messages
  FOR EACH ROW EXECUTE FUNCTION bump_social_conversation_updated_at();

ALTER TABLE social_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_chat_messages      ENABLE ROW LEVEL SECURITY;
