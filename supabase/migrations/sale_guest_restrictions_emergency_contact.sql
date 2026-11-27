-- Guest restrictions and an emergency contact on each service (sale).
-- Dietary and mobility restrictions are shown to the whole team on the
-- service; the emergency contact is only shown to Admin and Super Guide.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS dietary_restrictions  text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS mobility_restrictions text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS emergency_contact     text;
