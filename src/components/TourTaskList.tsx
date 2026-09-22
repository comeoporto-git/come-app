"use client";

import { useState, useTransition } from "react";
import type { SaleTask } from "@/lib/notion";
import { TASK_ROLE_OPTIONS } from "@/lib/constants";
import { updateTaskStatusAction, addSaleTaskAction } from "@/actions/tasks";

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
const ROLE_COLORS: Record<string, string> = {
  Admin:       "bg-purple-50 text-purple-600 border-purple-100",
  "Super Guide": "bg-purple-50 text-purple-600 border-purple-100",
  Guide:       "bg-[#667470]/10 text-[#667470] border-[#667470]/20",
  Chef:        "bg-red-50 text-red-600 border-red-100",
  Driver:      "bg-slate-100 text-slate-600 border-slate-200",
  Logistics:   "bg-orange-50 text-orange-600 border-orange-100",
};

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#32373c] bg-white placeholder:text-gray-400 focus:outline-none focus:border-[#667470] transition-colors";

function formatDueDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

function nextStatus(status: string | null): string {
  const i = STATUS_ORDER.indexOf(status ?? "To do");
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
}

export function TourTaskList({
  tourId, tasks, canManage, onTasksChange,
}: {
  tourId: string;
  tasks: SaleTask[];
  canManage: boolean;
  onTasksChange?: (tasks: SaleTask[]) => void;
}) {
  const [items, setItems] = useState(tasks);
  const [pending, startTransition] = useTransition();
  const [errorId, setErrorId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const doneCount = items.filter((t) => t.status === "Done").length;

  function toggle(task: SaleTask) {
    const status = nextStatus(task.status);
    setErrorId(null);
    const optimistic = items.map((t) => (t.id === task.id ? { ...t, status } : t));
    setItems(optimistic);
    onTasksChange?.(optimistic);
    startTransition(async () => {
      const result = await updateTaskStatusAction(tourId, task.id, status);
      if (result.error) {
        setErrorId(task.id);
        setItems(items);
        onTasksChange?.(items);
      }
    });
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Tarefas</h2>
        <div className="flex items-center gap-3">
          {items.length > 0 && <span className="text-xs text-gray-400">{doneCount}/{items.length}</span>}
          {canManage && !adding && (
            <button type="button" onClick={() => setAdding(true)} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
              + Adicionar
            </button>
          )}
        </div>
      </div>
      {items.length === 0 && !adding ? (
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
                    {task.role && (
                      <span className={`text-xs border px-1.5 py-0.5 rounded-md font-medium ${ROLE_COLORS[task.role] ?? "bg-gray-50 text-gray-500 border-gray-100"}`}>
                        {task.role}
                      </span>
                    )}
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
      {canManage && adding && (
        <div className="px-4 py-3 border-t border-gray-50">
          <NewTaskForm
            tourId={tourId}
            onCreated={(task) => {
              const next = [...items, task];
              setItems(next);
              onTasksChange?.(next);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
    </section>
  );
}

function NewTaskForm({
  tourId, onCreated, onCancel,
}: {
  tourId: string;
  onCreated: (task: SaleTask) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("");
  const [priority, setPriority] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await addSaleTaskAction(tourId, {
      name,
      description,
      role: role || null,
      priority: priority || null,
      dueDate: dueDate || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCreated({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      status: "To do",
      priority: priority || null,
      categoria: [],
      dueDate: dueDate || null,
      fileUrl: null,
      role: role || null,
      teamMemberId: null,
      teamMemberName: null,
    });
  }

  return (
    <div className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da tarefa" className={inputCls} />
      <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className={`${inputCls} resize-none`} />
      <div className="grid grid-cols-3 gap-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">Sem função</option>
          {TASK_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">Prioridade</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim()} className="bg-[#32373c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
          {saving ? "A guardar…" : "Guardar"}
        </button>
        <button onClick={onCancel} disabled={saving} className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}
