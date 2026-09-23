-- Additional team members on a service, each with the role they fill.
-- The single-slot columns on sales (guide_id, chef_id, driver_id,
-- logistics_id) stay the "primary" person per role — expense/payment logic
-- ("Pelo Chef", etc.) keeps resolving against them — and this table holds
-- any extra people, e.g. a second chef or another driver.
--
-- Separate from the legacy sales_team junction (Notion's roleless
-- "🧑🏼‍🍳 Team" relation), which isn't shown anywhere in the app.

CREATE TABLE IF NOT EXISTS sale_team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('Guide', 'Chef', 'Driver', 'Logistics')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sale_id, team_id, role)
);

CREATE INDEX IF NOT EXISTS sale_team_members_sale_idx ON sale_team_members(sale_id);
CREATE INDEX IF NOT EXISTS sale_team_members_team_idx ON sale_team_members(team_id);

ALTER TABLE sale_team_members ENABLE ROW LEVEL SECURITY;

-- Who actually paid a "Pelo Guia/Chef/Driver/Logistics" (or "Chef Fee")
-- expense. With several people per role on one service, the sale's single
-- chef_id/driver_id/... slot no longer identifies who to reimburse, so the
-- logging team member is recorded here and takes precedence over the slot.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS paid_by_team_id UUID REFERENCES team(id) ON DELETE SET NULL;
