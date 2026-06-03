import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function main() {
  console.log("Running CRM v2 migration...\n");

  const steps: Array<{ label: string; fn: () => Promise<unknown> }> = [
    {
      label: "Add stage to sales_pipeline",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Prospect'`,
    },
    {
      label: "Add company_size",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS company_size TEXT`,
    },
    {
      label: "Add country",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS country TEXT`,
    },
    {
      label: "Add industry",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS industry TEXT`,
    },
    {
      label: "Add linkedin_url to sales_pipeline",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS linkedin_url TEXT`,
    },
    {
      label: "Add notes to sales_pipeline",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS notes TEXT`,
    },
    {
      label: "Add last_contacted_at",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS last_contacted_at DATE`,
    },
    {
      label: "Add assigned_to to sales_pipeline",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES team(id)`,
    },
    {
      label: "Add enriched_at",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`,
    },
    {
      label: "Add enrichment_data",
      fn: () => sql`ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS enrichment_data JSONB`,
    },
    {
      label: "Migrate sales_status → stage",
      fn: () => sql`UPDATE sales_pipeline SET stage = sales_status WHERE sales_status IS NOT NULL AND stage = 'Prospect'`,
    },
    {
      label: "Add type to sales_activities",
      fn: () => sql`ALTER TABLE sales_activities ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'note'`,
    },
    {
      label: "Add status to sales_activities",
      fn: () => sql`ALTER TABLE sales_activities ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'done'`,
    },
    {
      label: "Add assigned_to to sales_activities",
      fn: () => sql`ALTER TABLE sales_activities ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES team(id)`,
    },
    {
      label: "Add contact_id to sales_activities",
      fn: () => sql`ALTER TABLE sales_activities ADD COLUMN IF NOT EXISTS contact_id UUID`,
    },
    {
      label: "Add scheduled_at to sales_activities",
      fn: () => sql`ALTER TABLE sales_activities ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`,
    },
    {
      label: "Create crm_contacts table",
      fn: () => sql`
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
        )`,
    },
    {
      label: "Create crm_weekly_actions table",
      fn: () => sql`
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
        )`,
    },
    {
      label: "Create index crm_weekly_actions_week_of_idx",
      fn: () => sql`CREATE INDEX IF NOT EXISTS crm_weekly_actions_week_of_idx ON crm_weekly_actions(week_of)`,
    },
  ];

  let failures = 0;
  for (const { label, fn } of steps) {
    try {
      await fn();
      console.log(`  ✓ ${label}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label}: ${msg}`);
      failures++;
    }
  }

  await sql.end();
  console.log(`\n${failures === 0 ? "✅ All done!" : `❌ ${failures} step(s) failed`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
