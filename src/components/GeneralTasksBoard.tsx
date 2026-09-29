"use client";

import { useState } from "react";
import Link from "next/link";
import type { SaleTask, PartnerServiceTasks } from "@/lib/notion";
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

function formatDate(iso: string | null): string {
  if (!iso) return "Sem data";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * Each partner's tasks: their general tasks (not tied to a booking), then
 * their open tasks on services, grouped by service with a link to it.
 */
export function GeneralTasksBoard({
  tasks: initialTasks, serviceTasks: initialServiceTasks,
}: {
  tasks: SaleTask[];
  serviceTasks: PartnerServiceTasks[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [services, setServices] = useState(initialServiceTasks);
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

  function handleServiceChange(saleId: string, partner: string, next: SaleTask[]) {
    setServices((prev) => prev.map((g) => {
      if (g.saleId !== saleId) return g;
      const sectionIds = new Set(tasksFor(g.tasks, partner).map((t) => t.id));
      return { ...g, tasks: [...g.tasks.filter((t) => !sectionIds.has(t.id)), ...next] };
    }));
  }

  function countFor(partner: string): number {
    return openCount(tasksFor(tasks, partner)) + services.reduce((n, g) => n + openCount(tasksFor(g.tasks, partner)), 0);
  }

  const partners = filter === "Todos" ? TASK_PARTNER_OPTIONS : [filter];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const count = f === "Todos" ? TASK_PARTNER_OPTIONS.reduce((n, p) => n + countFor(p), 0) : countFor(f);
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
      {partners.map((partner) => {
        const partnerServices = services.filter((g) => g.tasks.some((t) => !t.parentId && t.role === partner));
        return (
          <div key={partner} className="space-y-3">
            <TourTaskList
              key={`${partner}-${revision}`}
              tourId={null}
              tasks={tasksFor(tasks, partner)}
              canManage
              onTasksChange={(next) => handleChange(partner, next)}
              title={partner}
              emptyText={`Sem tarefas gerais para ${partner}`}
              roleOptions={TASK_PARTNER_OPTIONS}
              defaultRole={partner}
            />
            {partnerServices.length > 0 && (
              <div className="pl-4 border-l-2 border-white/20 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/80">
                  Serviços · {partner}
                </h3>
                {partnerServices.map((g) => (
                  // Status and subtasks can be ticked off here; edits happen on the service page.
                  <TourTaskList
                    key={`${partner}-${g.saleId}`}
                    tourId={g.saleId}
                    tasks={tasksFor(g.tasks, partner)}
                    canManage={false}
                    onTasksChange={(next) => handleServiceChange(g.saleId, partner, next)}
                    title={
                      <Link href={`/guide/tours/${g.saleId}`} className="group block min-w-0">
                        <span className="block truncate group-hover:underline">{g.label || g.serviceName || "Serviço"} →</span>
                        <span className="block text-xs font-normal text-gray-400 truncate">
                          {formatDate(g.date)}{g.serviceName && g.label ? ` · ${g.serviceName}` : ""}
                        </span>
                      </Link>
                    }
                    defaultRole={partner}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
