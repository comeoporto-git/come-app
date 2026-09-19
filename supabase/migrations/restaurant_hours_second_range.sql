ALTER TABLE restaurant_hours
  ADD COLUMN IF NOT EXISTS open_time_2 TIME,
  ADD COLUMN IF NOT EXISTS close_time_2 TIME;
