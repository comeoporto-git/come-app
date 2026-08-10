-- Social Media Post Manager — Phase 1 (Google Drive sync + AI photo scoring
-- + approve/reject review). social_posts is created now, empty, so Phase 2
-- (captions + revision thread) can build on the photo_id FK without a
-- schema migration blocking that work.

CREATE TABLE IF NOT EXISTS social_brand_brief (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tone            TEXT,
  offerings       TEXT,
  website_summary TEXT,
  audience        TEXT,
  guidelines      TEXT,
  updated_by      UUID REFERENCES team(id),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Singleton row — app code always upserts this fixed id, so every AI call
-- has brand context to inject even before the Phase 4 editor UI exists.
INSERT INTO social_brand_brief (id, tone, offerings, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Caloroso, próximo e orgulhoso da cultura gastronómica do Porto.',
  'Tours e experiências gastronómicas no Porto.',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS social_drive_connection (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id             TEXT NOT NULL,
  folder_name           TEXT,
  connected_by_team_id  UUID REFERENCES team(id),
  sync_mode             TEXT NOT NULL DEFAULT 'manual',
  last_synced_at        TIMESTAMPTZ,
  last_modified_cursor  TIMESTAMPTZ,
  last_sync_error       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Singleton row — app code always upserts this fixed id (one Drive folder
-- connection at a time for now).
INSERT INTO social_drive_connection (id, folder_id, folder_name)
VALUES ('00000000-0000-0000-0000-000000000002', '', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS social_photos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id        TEXT NOT NULL UNIQUE,
  filename             TEXT,
  parent_folder_name   TEXT,
  blob_url             TEXT NOT NULL,
  drive_modified_time  TIMESTAMPTZ,
  review_status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by          UUID REFERENCES team(id),
  reviewed_at          TIMESTAMPTZ,
  ai_score             NUMERIC,
  ai_score_reason      TEXT,
  ai_tags              TEXT[],
  ai_scored_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_photos_review_status ON social_photos(review_status);
CREATE INDEX IF NOT EXISTS idx_social_photos_ai_score ON social_photos(ai_score DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS social_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id       UUID REFERENCES social_photos(id),
  caption        TEXT,
  status         TEXT NOT NULL DEFAULT 'draft', -- draft | in_review | approved | scheduled | published | archived
  scheduled_for  TIMESTAMPTZ,
  published_at   TIMESTAMPTZ,
  ig_permalink   TEXT,
  ig_media_id    TEXT,
  platform       TEXT NOT NULL DEFAULT 'instagram',
  created_by     UUID REFERENCES team(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);

ALTER TABLE social_brand_brief      ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_drive_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts            ENABLE ROW LEVEL SECURITY;
