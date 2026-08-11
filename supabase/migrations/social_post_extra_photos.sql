-- Carousel support: a post's `photo_id` stays the cover/first slide, and
-- extra slides are attached here in display order.
CREATE TABLE IF NOT EXISTS social_post_extra_photos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  photo_id   UUID NOT NULL REFERENCES social_photos(id),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_social_post_extra_photos_post ON social_post_extra_photos(post_id, position);

ALTER TABLE social_post_extra_photos ENABLE ROW LEVEL SECURITY;
