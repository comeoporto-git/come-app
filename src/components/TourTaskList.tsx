"use client";

import { useState, useTransition } from "react";
import type { SaleTask } from "@/lib/notion";
import { updateTaskStatusAction } from "@/actions/tasks";

const STATUS_ORDER = ["To do", "In Progress", "Done"];
const STATUS_LABELS: Record<string, string> = { "To do": "Por fazer", "In Progress": "Em curso", "Done": "Concluída" };
const STATUS_COLORS: Record<string, string> = {
  "To do":       "bg-gray-100 text-gray-500",
  "In Progress": "bg-blue-100 text-blue-700",
  "Done":        "bg-emerald-100 text-emerald-700",
};
const PRIORITY_COLORS: Record<string, string> = {
  High:   "bg-red-50 text-red-600 border-red-100",
  Medium: "bg-amber-50 text-amber-600 border-amber-100",
  Low:    "bg-gray-50 text-gray-500 border-gray-100",
};

function formatDueDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

function nextStatus(status: string | null): string {
  const i = STATUS_ORDER.indexOf(status ?? "To do");
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
}

export function TourTaskList({ tourId, tasks }: { tourId: string; tasks: SaleTask[] }) {
  const [items, setItems] = useState(tasks);
  const [pending, startTransition] = useTransition();
  const [errorId, setErrorId] = useState<string | null>(null);

  const doneCount = items.filter((t) => t.status === "Done").length;

  function toggle(task: SaleTask) {
    const status = nextStatus(task.status);
    setErrorId(null);
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    startTransition(async () => {
      const result = await updateTaskStatusAction(tourId, task.id, status);
      if (result.error) {
        setErrorId(task.id);
        setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      }
    });
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Tarefas</h2>
        {items.length > 0 && (
          <span className="text-xs text-gray-400">{doneCount}/{items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma tarefa associada a este serviço</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((task) => {
            const status = task.status ?? "To do";
            const isDone = status === "Done";
            return (
              <li key={task.id} className="px-4 py-3 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(task)}
                  disabled={pending}
                  aria-label={`Marcar tarefa como ${STATUS_LABELS[nextStatus(status)]}`}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors disabled:opacity-50 ${
                    isDone ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-[#667470]"
                  }`}
                >
                  {isDone && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isDone ? "text-gray-400 line-through" : "text-[#32373c]"}`}>{task.name}</p>
                  {task.description && (
                    <p className={`text-sm mt-0.5 whitespace-pre-line ${isDone ? "text-gray-300" : "text-gray-500"}`}>{task.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggle(task)}
                      disabled={pending}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium disabled:opacity-50 ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500"}`}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </button>
                    {task.priority && (
                      <span className={`text-xs border px-1.5 py-0.5 rounded-md font-medium ${PRIORITY_COLORS[task.priority] ?? "bg-gray-50 text-gray-500 border-gray-100"}`}>
                        {task.priority}
                      </span>
                    )}
                    {task.dueDate && <span className="text-xs text-gray-400">{formatDueDate(task.dueDate)}</span>}
                    {task.teamMemberName && <span className="text-xs text-gray-400">{task.teamMemberName}</span>}
                  </div>
                  {errorId === task.id && <p className="text-xs text-red-500 font-medium mt-1">Erro ao guardar, tenta novamente</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
