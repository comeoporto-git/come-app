"use client";

import { useState, type MouseEvent } from "react";
import type { SaleTask, TaskCount } from "@/lib/notion";
import { getSaleTasksAction } from "@/actions/tasks";
import { TourTaskList } from "@/components/TourTaskList";

type ClickLike = { preventDefault?: () => void; stopPropagation?: () => void };

/** Local expand/collapse + lazy task-list fetch, shared by any service card that shows a "done/total" badge. */
export function useServiceTasks(tourId: string, initialCount: TaskCount) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<SaleTask[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(initialCount);

  async function toggle(e?: ClickLike) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!expanded && tasks === null) {
      setLoading(true);
      const result = await getSaleTasksAction(tourId);
      setLoading(false);
      if (result.tasks) {
        setTasks(result.tasks);
        setCount({ done: result.tasks.filter((t) => t.status === "Done").length, total: result.tasks.length });
      }
    }
    setExpanded((v) => !v);
  }

  function updateTasks(next: SaleTask[]) {
    setTasks(next);
    setCount({ done: next.filter((t) => t.status === "Done").length, total: next.length });
  }

  return { expanded, tasks, loading, count, toggle, updateTasks };
}

export function ServiceTaskBadge({
  done, total, expanded, onClick, dark,
}: { done: number; total: number; expanded: boolean; onClick: (e: MouseEvent) => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? "Fechar tarefas" : "Ver tarefas"}
      aria-expanded={expanded}
      className={`flex items-center gap-1 text-xs font-semibold rounded-full pl-2 pr-1 py-0.5 transition-colors ${
        dark ? "bg-white/15 text-white/80 hover:bg-white/25" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {done}/{total}
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center text-[11px] leading-none font-bold ${
          dark ? "bg-white/25 text-white" : "bg-white text-gray-600"
        }`}
      >
        {expanded ? "–" : "+"}
      </span>
    </button>
  );
}

export function ServiceTaskPanel({
  tourId, tasks, loading, canManage, onTasksChange,
}: {
  tourId: string;
  tasks: SaleTask[] | null;
  loading: boolean;
  canManage: boolean;
  onTasksChange: (tasks: SaleTask[]) => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="border-t border-gray-100">
      {loading ? (
        <p className="px-4 py-3 text-xs text-gray-400">A carregar tarefas…</p>
      ) : (
        <TourTaskList tourId={tourId} tasks={tasks ?? []} canManage={canManage} onTasksChange={onTasksChange} />
      )}
    </div>
  );
}
