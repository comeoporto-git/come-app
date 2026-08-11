-- Tracks photos whose Drive file was deleted/moved out of the synced folder
-- tree, so the review UI can flag them instead of silently keeping a photo
-- around that no longer exists at the source. Cleared automatically if the
-- file reappears on a later sync.
ALTER TABLE social_photos ADD COLUMN IF NOT EXISTS missing_since TIMESTAMPTZ;
