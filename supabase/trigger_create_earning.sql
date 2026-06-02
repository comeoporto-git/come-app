-- Trigger: when a sale is created with a specific service,
-- automatically create the corresponding "IN -" earning transaction.
-- Replicates the Notion automation.

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

  -- Get service pricing details
  SELECT name, pax_2_3, pax_4_6, pax_7_plus
  INTO v_service_name, v_pax_2_3, v_pax_4_6, v_pax_7_plus
  FROM services
  WHERE id = NEW.service_id;

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

CREATE OR REPLACE TRIGGER trigger_create_earning_on_sale
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION create_earning_transaction();
