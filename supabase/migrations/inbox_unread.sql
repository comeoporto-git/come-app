-- Conversas com emails por ler no Gmail aparecem sempre nos Pendentes da app.
ALTER TABLE inbox_threads ADD COLUMN IF NOT EXISTS unread boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS inbox_threads_unread_idx ON inbox_threads(unread) WHERE unread;
