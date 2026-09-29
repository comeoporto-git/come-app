-- Subtasks (Asana-style): a booking task can have child tasks, one level
-- deep. Subtasks share the parent's sale_id and are deleted with it.
-- sort_order orders subtasks within their parent.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tasks_parent_task_idx ON tasks(parent_task_id);
