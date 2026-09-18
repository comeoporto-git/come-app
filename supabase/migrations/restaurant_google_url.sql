-- Store the Google Business/Maps share URL on a restaurant so its weekly
-- hours can be looked up from it (see fetchRestaurantHoursFromUrl).

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_url TEXT;
