-- The service_prices_by_year migration moved pax_2_3/pax_4_6/pax_7_plus from
-- services into a per-year service_prices table and updated sales_computed
-- accordingly, but left create_earning_transaction() (AFTER INSERT ON sales)
-- still reading those columns off services, where they no longer exist.
-- Every sale/tour insert (from the app's "+ Serviço" form and the Workspace
-- Add-on alike) was failing with: column "pax_2_3" does not exist.

CREATE OR REPLACE FUNCTION create_earning_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_service_name TEXT;
  v_pax_2_3      NUMERIC;
  v_pax_4_6      NUMERIC;
  v_pax_7_plus   NUMERIC;
  v_preco_iva    NUMERIC;
BEGIN
  -- Only proceed if a service is linked
  IF NEW.service_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_service_name FROM services WHERE id = NEW.service_id;

  -- Pricing now lives per-year in service_prices; use the year closest to
  -- the sale's own date, same as the sales_computed view.
  SELECT sp.pax_2_3, sp.pax_4_6, sp.pax_7_plus
  INTO v_pax_2_3, v_pax_4_6, v_pax_7_plus
  FROM service_prices sp
  WHERE sp.service_id = NEW.service_id
  ORDER BY abs(sp.year - EXTRACT(YEAR FROM NEW.date)::int) ASC, sp.year ASC
  LIMIT 1;

  -- Skip if an earning transaction already exists for this sale
  IF EXISTS (
    SELECT 1 FROM transactions WHERE sale_id = NEW.id AND type = 'Earning'
  ) THEN
    RETURN NEW;
  END IF;

  -- Calculate Preço Serviço + IVA using the same tier logic as the SQL view
  v_preco_iva := CASE
    WHEN COALESCE(NEW.number_of_guests, 0) >= 7 THEN COALESCE(v_pax_7_plus, 0) * NEW.number_of_guests * 1.23
    WHEN COALESCE(NEW.number_of_guests, 0) >= 4 THEN COALESCE(v_pax_4_6, 0)    * NEW.number_of_guests * 1.23
    WHEN COALESCE(NEW.number_of_guests, 0) >= 2 THEN COALESCE(v_pax_2_3, 0)    * NEW.number_of_guests * 1.23
    WHEN COALESCE(NEW.number_of_guests, 0) =  1 THEN COALESCE(v_pax_2_3, 0)    * 2                    * 1.23
    ELSE 0
  END;

  -- Create the earning transaction
  INSERT INTO transactions (
    notion_id,
    data,
    conta_pagamento,
    type,
    valor,
    sale_id,
    client_id
  ) VALUES (
    'IN - ' || COALESCE(NEW.notion_id, ''),
    NEW.date,
    'COME',
    'Earning',
    v_preco_iva,
    NEW.id,
    NEW.client_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
