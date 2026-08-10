-- Social Media Post Manager — Phase 2 (AI-drafted captions + revision thread)
-- social_posts already exists (Phase 1 migration). This adds the comment
-- thread table: it doubles as the review record on each post ("recorded on
-- that post for future review") and as the brand-voice memory source
-- src/lib/social-ai.ts pulls from when generating future captions.

CREATE TABLE IF NOT EXISTS social_post_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_type       TEXT NOT NULL, -- 'owner' | 'ai'
  author_team_id    UUID REFERENCES team(id), -- null when author_type = 'ai'
  body              TEXT NOT NULL,
  caption_snapshot  TEXT, -- caption text at the moment of this comment (audit trail)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_post_comments_post_id ON social_post_comments(post_id, created_at);

ALTER TABLE social_post_comments ENABLE ROW LEVEL SECURITY;
