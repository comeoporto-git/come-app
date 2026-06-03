-- CRM v2 migration — extend sales_pipeline + sales_activities, add crm_contacts + crm_weekly_actions

-- ── Extend sales_pipeline (Account entity) ──────────────────────────────────

ALTER TABLE sales_pipeline
  ADD COLUMN IF NOT EXISTS stage             TEXT DEFAULT 'Prospect',
  ADD COLUMN IF NOT EXISTS company_size      TEXT,
  ADD COLUMN IF NOT EXISTS country           TEXT,
  ADD COLUMN IF NOT EXISTS industry          TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url      TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at DATE,
  ADD COLUMN IF NOT EXISTS assigned_to       UUID REFERENCES team(id),
  ADD COLUMN IF NOT EXISTS enriched_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_data   JSONB;

-- Migrate existing sales_status → stage for any existing rows
UPDATE sales_pipeline SET stage = sales_status WHERE sales_status IS NOT NULL AND stage = 'Prospect';

-- ── Extend sales_activities ──────────────────────────────────────────────────

ALTER TABLE sales_activities
  ADD COLUMN IF NOT EXISTS type         TEXT DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS assigned_to  UUID REFERENCES team(id),
  ADD COLUMN IF NOT EXISTS contact_id   UUID,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- ── crm_contacts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID REFERENCES sales_pipeline(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  country      TEXT,
  linkedin_url TEXT,
  role         TEXT,
  is_primary   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from sales_activities.contact_id now that crm_contacts exists
-- (cannot add as FK in ALTER above because table didn't exist yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_activities_contact_id_fkey'
  ) THEN
    ALTER TABLE sales_activities
      ADD CONSTRAINT sales_activities_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ── crm_weekly_actions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_weekly_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of          DATE NOT NULL,
  account_id       UUID REFERENCES sales_pipeline(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  action_type      TEXT,
  subject          TEXT,
  suggested_script TEXT,
  priority         INTEGER,
  status           TEXT DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for weekly lookup
CREATE INDEX IF NOT EXISTS crm_weekly_actions_week_of_idx ON crm_weekly_actions(week_of);
