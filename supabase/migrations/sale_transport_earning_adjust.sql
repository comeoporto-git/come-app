-- Transport can be added, changed or removed on a booking at any time.
-- When sales.transport_vehicle changes, the booking's earning (IN-) moves by
-- the difference in transport price (+23% VAT), keeping any manual edits to
-- the rest of the amount. Bookings already Invoiced or Paid are left alone.

CREATE OR REPLACE FUNCTION adjust_earning_for_transport()
RETURNS TRIGGER AS $$
DECLARE
  v_old   NUMERIC;
  v_new   NUMERIC;
  v_delta NUMERIC;
BEGIN
  IF NEW.transport_vehicle IS NOT DISTINCT FROM OLD.transport_vehicle THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('Invoiced', 'Paid') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(o.price, 0) INTO v_old
  FROM services s
  JOIN transport_options o ON o.vehicle = OLD.transport_vehicle AND o.hours = s.transport_hours
  WHERE s.id = OLD.service_id;

  SELECT COALESCE(o.price, 0) INTO v_new
  FROM services s
  JOIN transport_options o ON o.vehicle = NEW.transport_vehicle AND o.hours = s.transport_hours
  WHERE s.id = NEW.service_id;

  v_delta := (COALESCE(v_new, 0) - COALESCE(v_old, 0)) * 1.23;
  IF v_delta <> 0 THEN
    UPDATE transactions
    SET valor = COALESCE(valor, 0) + v_delta
    WHERE id = (
      SELECT id FROM transactions
      WHERE sale_id = NEW.id AND type = 'Earning'
      ORDER BY created_at
      LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_adjust_earning_for_transport ON sales;
CREATE TRIGGER trigger_adjust_earning_for_transport
  AFTER UPDATE OF transport_vehicle ON sales
  FOR EACH ROW
  EXECUTE FUNCTION adjust_earning_for_transport();
