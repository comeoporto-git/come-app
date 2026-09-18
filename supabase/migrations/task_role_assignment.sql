-- Let a task be assigned to a role (e.g. "Book a Driver" -> Admin,
-- "Pickup table, glasses, frappe" -> Chef) instead of, or in addition to,
-- a specific team member. Used to filter which tasks a tour's viewers see:
-- Admin/Super Guide see everything; everyone else sees every task except
-- ones assigned to the Admin or Super Guide role.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IS NULL OR role IN ('Admin', 'Guide', 'Super Guide', 'Chef', 'Driver', 'Logistics'));

CREATE INDEX IF NOT EXISTS tasks_role_idx ON tasks(role);
