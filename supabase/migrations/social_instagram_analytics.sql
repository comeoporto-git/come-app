-- Social Media Post Manager — Phase 4 (Instagram read integration + analytics)
-- Manual-token connection (no OAuth flow): the owner pastes a long-lived
-- Page Access Token + IDs generated once via Meta's tools. No write/publish
-- scope is ever requested or used here.

CREATE TABLE IF NOT EXISTS social_ig_connection (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_business_account_id TEXT,
  fb_page_id             TEXT,
  page_access_token      TEXT, -- server-only, never returned to the client
  token_expires_at       TIMESTAMPTZ,
  connected_by_team_id   UUID REFERENCES team(id),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Singleton row — app code always upserts this fixed id.
INSERT INTO social_ig_connection (id) VALUES ('00000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS social_ig_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          UUID REFERENCES social_posts(id),
  ig_media_id      TEXT,
  impressions      INTEGER,
  reach            INTEGER,
  likes            INTEGER,
  comments         INTEGER,
  saves            INTEGER,
  shares           INTEGER,
  engagement_rate  NUMERIC,
  raw_metrics      JSONB,
  fetched_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_ig_insights_post_id ON social_ig_insights(post_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS social_ai_analysis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  DATE,
  period_end    DATE,
  summary       TEXT,
  generated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE social_ig_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_ig_insights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_ai_analysis   ENABLE ROW LEVEL SECURITY;
