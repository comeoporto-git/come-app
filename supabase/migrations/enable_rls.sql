-- Enable Row Level Security on every public table.
--
-- The app never talks to Supabase's PostgREST API as `anon`/`authenticated`:
-- src/lib/notion.ts uses the `service_role` key (bypasses RLS), and both
-- src/lib/db.ts and src/lib/auth.ts (NextAuth's pg adapter) connect
-- directly to Postgres as the table owner (also bypasses RLS). So enabling
-- RLS with no policies doesn't break app access — it just stops these
-- tables from being world-readable/writable through the public API, which
-- is what Supabase's security advisor flagged (rls_disabled_in_public /
-- sensitive_columns_exposed).
--
-- Includes the NextAuth tables (users/accounts/sessions/verification_token
-- from scripts/migrate-auth.sql) — accounts.access_token/refresh_token and
-- sessions.sessionToken are at least as sensitive as the business data.

ALTER TABLE team                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE services                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_team              ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE clothing                ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_pipeline          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_media_planner    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_weekly_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages        ENABLE ROW LEVEL SECURITY;

-- NextAuth tables (scripts/migrate-auth.sql)
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_token      ENABLE ROW LEVEL SECURITY;
