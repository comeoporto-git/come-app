-- Manual ordering of a booking's tasks (drag / ↑↓ on the service detail page).
-- NULL sorts last, after the ordered tasks, by due date — e.g. tasks that
-- propagateServiceTaskToSales appends to existing bookings.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Keep the order tasks were shown in until now (due date, then creation).
UPDATE tasks t
SET sort_order = o.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY sale_id ORDER BY due_date NULLS LAST, created_at) - 1 AS rn
  FROM tasks
  WHERE sale_id IS NOT NULL
) o
WHERE t.id = o.id AND t.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS tasks_sale_sort_idx ON tasks(sale_id, sort_order);
