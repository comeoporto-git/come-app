-- "Decorador" as a full team role, with the same parity as Logistics:
-- a primary slot on sales, extra members per service, and task assignment.
-- The account role (team.role) and "Pelo Decorador" payment method are plain
-- text columns, so they need no schema change.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS decorador_id UUID REFERENCES team(id);

ALTER TABLE sale_team_members DROP CONSTRAINT IF EXISTS sale_team_members_role_check;
ALTER TABLE sale_team_members ADD CONSTRAINT sale_team_members_role_check
  CHECK (role IN ('Guide', 'Chef', 'Driver', 'Logistics', 'Decorador'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_role_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_role_check
  CHECK (role IS NULL OR role IN ('Admin', 'Guide', 'Super Guide', 'Chef', 'Driver', 'Logistics', 'Decorador', 'Bernardo', 'António', 'Manel'));

ALTER TABLE service_tasks DROP CONSTRAINT IF EXISTS service_tasks_role_check;
ALTER TABLE service_tasks ADD CONSTRAINT service_tasks_role_check
  CHECK (role IS NULL OR role IN ('Admin', 'Guide', 'Super Guide', 'Chef', 'Driver', 'Logistics', 'Decorador', 'Bernardo', 'António', 'Manel'));
