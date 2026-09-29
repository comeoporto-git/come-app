-- Subtasks (Asana-style): a task can have child tasks, one level deep,
-- deleted with it. The link is task -> task only, so it works the same for
-- booking tasks (sale_id) and for tasks with no sale (e.g. general tasks for
-- the partners). Booking subtasks also carry the parent's sale_id.
-- sort_order orders subtasks within their parent.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tasks_parent_task_idx ON tasks(parent_task_id);
