"use client";

import { useState } from "react";
import type { SaleTask } from "@/lib/notion";
import { TASK_PARTNER_OPTIONS } from "@/lib/constants";
import { TourTaskList } from "@/components/TourTaskList";

type Filter = "Todos" | typeof TASK_PARTNER_OPTIONS[number];
const FILTERS: Filter[] = ["Todos", ...TASK_PARTNER_OPTIONS];

/** A partner's tasks: top-level tasks assigned to them, plus those tasks' subtasks (whoever they're assigned to). */
function tasksFor(tasks: SaleTask[], partner: string): SaleTask[] {
  const ids = new Set(tasks.filter((t) => !t.parentId && t.role === partner).map((t) => t.id));
  return tasks.filter((t) => (t.parentId ? ids.has(t.parentId) : ids.has(t.id)));
}

function openCount(tasks: SaleTask[]): number {
  return tasks.filter((t) => !t.parentId && t.status !== "Done").length;
}

/** General tasks (not tied to a booking), one list per partner. */
export function GeneralTasksBoard({ tasks: initialTasks }: { tasks: SaleTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState<Filter>("Todos");
  // Bumped when a task is reassigned to another partner, so every list
  // remounts from `tasks` and the task shows up under its new owner.
  const [revision, setRevision] = useState(0);

  function handleChange(partner: string, next: SaleTask[]) {
    setTasks((prev) => {
      const sectionIds = new Set(tasksFor(prev, partner).map((t) => t.id));
      return [...prev.filter((t) => !sectionIds.has(t.id)), ...next];
    });
    if (next.some((t) => !t.parentId && t.role !== partner)) setRevision((r) => r + 1);
  }

  const partners = filter === "Todos" ? TASK_PARTNER_OPTIONS : [filter];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const count = openCount(f === "Todos" ? tasks : tasksFor(tasks, f));
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${
                active ? "bg-white text-[#32373c]" : "bg-white/15 text-white/80 hover:bg-white/25"
              }`}
            >
              {f}
              {count > 0 && <span className={`ml-1.5 ${active ? "text-gray-400" : "text-white/60"}`}>{count}</span>}
            </button>
          );
        })}
      </div>
      {partners.map((partner) => (
        <TourTaskList
          key={`${partner}-${revision}`}
          tourId={null}
          tasks={tasksFor(tasks, partner)}
          canManage
          onTasksChange={(next) => handleChange(partner, next)}
          title={partner}
          emptyText={`Sem tarefas para ${partner}`}
          roleOptions={TASK_PARTNER_OPTIONS}
          defaultRole={partner}
        />
      ))}
    </div>
  );
}
