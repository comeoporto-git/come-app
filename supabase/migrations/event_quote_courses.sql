-- Menu courses on event quotes (Snack 1, Principal, Sobremesa…).
-- event_quotes.courses keeps the order of the courses, including ones with no material yet;
-- event_quote_lines.course ties a material line to the course that needs it.
ALTER TABLE event_quotes ADD COLUMN IF NOT EXISTS courses text[] NOT NULL DEFAULT '{}';
ALTER TABLE event_quote_lines ADD COLUMN IF NOT EXISTS course text;
