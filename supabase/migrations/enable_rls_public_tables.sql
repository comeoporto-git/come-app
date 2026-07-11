-- Enable Row-Level Security on every table in the public schema.
--
-- Supabase's security advisor flags any public table without RLS as
-- "publicly accessible" because Supabase's auto-generated PostgREST API
-- grants anon/authenticated roles access by default. This app never uses
-- that API — it talks to Postgres directly via DATABASE_URL (see
-- src/lib/db.ts) using a role that owns these tables, so table owners
-- bypass RLS automatically and app behavior is unaffected. No policies
-- are added: the intent is to deny all access via the PostgREST API.

ALTER TABLE IF EXISTS team                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS services                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fornecedores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales_team               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clothing                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS business_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales_pipeline           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales_activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS social_media_planner     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_chat_conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_chat_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crm_contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crm_weekly_actions       ENABLE ROW LEVEL SECURITY;

-- Created outside the tracked migrations (via Supabase SQL editor) but
-- referenced by src/lib/supabase.ts — flagged by the same advisor.
ALTER TABLE IF EXISTS ai_corrections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supplier_mappings        ENABLE ROW LEVEL SECURITY;
