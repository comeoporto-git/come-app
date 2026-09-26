-- Tasks (per booking and service templates) can also be assigned to one of
-- the partners — Bernardo, António, Manel — not only to a role. Like Admin /
-- Super Guide tasks, they're hidden from other roles (see getTasksForSale).

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_role_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_role_check
  CHECK (role IS NULL OR role IN ('Admin', 'Guide', 'Super Guide', 'Chef', 'Driver', 'Logistics', 'Bernardo', 'António', 'Manel'));

ALTER TABLE service_tasks DROP CONSTRAINT IF EXISTS service_tasks_role_check;
ALTER TABLE service_tasks ADD CONSTRAINT service_tasks_role_check
  CHECK (role IS NULL OR role IN ('Admin', 'Guide', 'Super Guide', 'Chef', 'Driver', 'Logistics', 'Bernardo', 'António', 'Manel'));
