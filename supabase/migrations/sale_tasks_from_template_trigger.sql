-- Copy a service's task templates (service_tasks) into real tasks whenever a
-- booking (sales row) is created or switched to another service.
--
-- This used to live only in the app's createSale(), so bookings created by
-- the Notion -> Supabase sync (an upsert on notion_id that never goes
-- through the app) ended up with no default tasks. Doing it in the database
-- covers every insert path.
--
-- Templates are matched by name (case/whitespace-insensitive), so a task
-- the booking already has is never duplicated and the function is safe to
-- re-run.

CREATE OR REPLACE FUNCTION copy_service_tasks_to_sale(p_sale_id uuid, p_service_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int;
BEGIN
  IF p_service_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_offset FROM tasks WHERE sale_id = p_sale_id;

  INSERT INTO tasks (sale_id, sort_order, name, task_description, role, status)
  SELECT p_sale_id,
         v_offset + ROW_NUMBER() OVER (ORDER BY st.sort_order) - 1,
         st.name,
         st.description,
         st.role,
         'To do'
  FROM service_tasks st
  WHERE st.service_id = p_service_id
    AND NOT EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.sale_id = p_sale_id
        AND lower(btrim(t.name)) = lower(btrim(st.name))
    );
END;
$$;

CREATE OR REPLACE FUNCTION sales_copy_service_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.service_id IS DISTINCT FROM OLD.service_id THEN
    PERFORM copy_service_tasks_to_sale(NEW.id, NEW.service_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sales_copy_service_tasks ON sales;
CREATE TRIGGER trigger_sales_copy_service_tasks
  AFTER INSERT OR UPDATE OF service_id ON sales
  FOR EACH ROW EXECUTE FUNCTION sales_copy_service_tasks();

-- Backfill: upcoming, non-cancelled bookings that are missing template tasks.
SELECT copy_service_tasks_to_sale(s.id, s.service_id)
FROM sales s
WHERE s.date >= CURRENT_DATE
  AND s.status IS DISTINCT FROM 'Cancelled'
  AND s.service_id IS NOT NULL;
