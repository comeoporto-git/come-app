-- Caixa de Entrada automática: a cada 2 minutos o Postgres (pg_cron + pg_net)
-- chama /api/cron/inbox-sync na app, que lê os emails novos e prepara as
-- respostas e as tarefas. O endereço da app e o token são guardados em
-- inbox_settings (o endereço é gravado pela própria app quando um admin a abre).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE inbox_settings
  ADD COLUMN IF NOT EXISTS app_url          text,
  ADD COLUMN IF NOT EXISTS cron_token       text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS sync_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS auto_sync        boolean NOT NULL DEFAULT true;

-- Threads whose analysis keeps failing on the same message are not retried forever.
ALTER TABLE inbox_threads
  ADD COLUMN IF NOT EXISTS error_message_id text,
  ADD COLUMN IF NOT EXISTS error_attempts   integer NOT NULL DEFAULT 0;

-- Tasks the agent created from a conversation, so a later email updates or
-- closes the same task instead of creating a new one.
CREATE TABLE IF NOT EXISTS inbox_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL,
  key         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, key)
);
ALTER TABLE inbox_tasks ENABLE ROW LEVEL SECURITY;

-- Called by pg_cron: posts to the app if it knows its address and auto sync is on.
CREATE OR REPLACE FUNCTION inbox_sync_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s record;
BEGIN
  SELECT app_url, cron_token, auto_sync INTO s FROM inbox_settings WHERE id = 1;
  IF s.app_url IS NULL OR NOT s.auto_sync THEN RETURN; END IF;
  PERFORM net.http_get(
    url := rtrim(s.app_url, '/') || '/api/cron/inbox-sync',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.cron_token),
    timeout_milliseconds := 10000
  );
END $$;
REVOKE ALL ON FUNCTION inbox_sync_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'inbox-sync';
SELECT cron.schedule('inbox-sync', '*/2 * * * *', 'SELECT inbox_sync_tick()');
