-- One-off: move the open Notion-era tasks that aren't tied to anything
-- (no sale, deal, transaction or social post) onto /admin/tarefas by
-- assigning them to the partner they were assigned to in Notion
-- (team_member_id). Unnamed tasks are left alone. Ordered by due date.

WITH partner AS (
  SELECT t.id,
         CASE tm.name
           WHEN 'Antonio Antunes'      THEN 'António'
           WHEN 'Bernardo Providência' THEN 'Bernardo'
           WHEN 'Manuel Antunes'       THEN 'Manel'
         END AS role,
         ROW_NUMBER() OVER (ORDER BY t.due_date NULLS LAST, t.created_at) - 1 AS rn
  FROM tasks t
  JOIN team tm ON tm.id = t.team_member_id
  WHERE t.role IS NULL
    AND t.sale_id IS NULL AND t.sales_pipeline_id IS NULL
    AND t.transaction_id IS NULL AND t.social_media_id IS NULL
    AND COALESCE(t.status, '') <> 'Done'
    AND COALESCE(TRIM(t.name), '') <> ''
    AND tm.name IN ('Antonio Antunes', 'Bernardo Providência', 'Manuel Antunes')
)
UPDATE tasks t
SET role = p.role, sort_order = p.rn
FROM partner p
WHERE t.id = p.id;
