-- Let a service catalog task template (the Admin-only prep checklist on a
-- service type) be assigned to a responsible role, same idea as tasks.role
-- for individual bookings — e.g. "Book a Driver" -> Admin,
-- "Pickup table, glasses, frappe" -> Chef.

ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IS NULL OR role IN ('Admin', 'Guide', 'Super Guide', 'Chef', 'Driver', 'Logistics'));
