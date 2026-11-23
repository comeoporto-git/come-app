-- Last year a service is offered. NULL = still offered.
-- From 2027 COME no longer sells Fisherman Road (without Chef), Surprise
-- Surprise with the COME driver, the Chefs House cooking class or the
-- Chef + Sommelier em Casa menus. They stay in the catalogue for history and
-- 2026 bookings, but are left out of later price lists and quotes, and a
-- booking for a later year shows a warning.
ALTER TABLE services ADD COLUMN IF NOT EXISTS available_until int;

UPDATE services SET available_until = 2026
WHERE trim(name) IN ('Fisherman Road', 'Surprise Surprise Douro (Motorista COME)', 'Cooking Class at Chefs House')
   OR type = 'Chef + Sommelier em Casa';
