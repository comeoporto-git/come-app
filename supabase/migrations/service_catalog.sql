-- Product/Service catalog — settings page for each service type
-- (distinct from `sales`, which are individual bookings of a service).
--
-- Adds: duration + free-text description on `services`, an ordered list of
-- steps (visible to every role), an ordered checklist of tasks (Admin
-- only), and a restaurant suggestion list with a weekly opening schedule
-- so guides can tell at a glance whether a suggested restaurant is open.

ALTER TABLE services ADD COLUMN IF NOT EXISTS description      TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

CREATE TABLE IF NOT EXISTS service_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_steps_service_idx ON service_steps(service_id, sort_order);

CREATE TABLE IF NOT EXISTS service_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_tasks_service_idx ON service_tasks(service_id, sort_order);

CREATE TABLE IF NOT EXISTS restaurants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One row per weekday (0=Sunday..6=Saturday). closed=true means the
-- restaurant does not open that day at all; open_time/close_time are the
-- single opening window otherwise (no split lunch/dinner ranges for now).
CREATE TABLE IF NOT EXISTS restaurant_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time     TIME,
  close_time    TIME,
  closed        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (restaurant_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS service_restaurants (
  service_id    UUID NOT NULL REFERENCES services(id)    ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  sort_order    INTEGER DEFAULT 0,
  notes         TEXT,
  PRIMARY KEY (service_id, restaurant_id)
);

ALTER TABLE service_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_hours    ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_restaurants ENABLE ROW LEVEL SECURITY;
