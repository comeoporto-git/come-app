"use client";

import { useState, useTransition } from "react";
import type { SaleTask } from "@/lib/notion";
import { TASK_ROLE_OPTIONS } from "@/lib/constants";
import { updateTaskStatusAction, addSaleTaskAction, updateSaleTaskAction, deleteSaleTaskAction, reorderSaleTasksAction } from "@/actions/tasks";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragStartItems, setDragStartItems] = useState<SaleTask[] | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  function replaceItems(next: SaleTask[]) {
    setItems(next);
    onTasksChange?.(next);
  }

  const canReorder = canManage && editingId === null;

  // Saves the new order; restores `previous` if the server rejects it.
  function persistOrder(next: SaleTask[], previous: SaleTask[]) {
    setReorderError(null);
    replaceItems(next);
    startTransition(async () => {
      const result = await reorderSaleTasksAction(tourId, next.map((t) => t.id));
      if (result.error) {
        setReorderError("Erro ao reordenar, tenta novamente");
        replaceItems(previous);
      }
    });
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    persistOrder(next, items);
  }

  function handleDragOver(e: React.DragEvent, overIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === overIndex) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
    setDragIndex(overIndex);
  }

  function handleDragEnd() {
    const previous = dragStartItems;
    setDragIndex(null);
    setDragStartItems(null);
    if (!previous || previous.every((t, i) => t.id === items[i]?.id)) return;
    persistOrder(items, previous);
  }

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
            <button type="button" onClick={() => { setEditingId(null); setAdding(true); }} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
              + Adicionar
            </button>
          )}
        </div>
      </div>
      {reorderError && <p className="px-4 pt-3 text-xs text-red-500 font-medium">{reorderError}</p>}
      {items.length === 0 && !adding ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma tarefa associada a este serviço</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((task, i) => {
            const status = task.status ?? "To do";
            const isDone = status === "Done";
            if (canManage && editingId === task.id) {
              return (
                <li key={task.id} className="px-4 py-3">
                  <TaskForm
                    tourId={tourId}
                    task={task}
                    onSaved={(updated) => {
                      replaceItems(items.map((t) => (t.id === updated.id ? updated : t)));
                      setEditingId(null);
                    }}
                    onDeleted={() => {
                      replaceItems(items.filter((t) => t.id !== task.id));
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              );
            }
            return (
              <li
                key={task.id}
                draggable={canReorder}
                onDragStart={() => { setDragStartItems(items); setDragIndex(i); }}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className={`px-4 py-3 flex items-start gap-3 transition-opacity ${dragIndex === i ? "opacity-40" : ""}`}
              >
                {canReorder && (
                  <span
                    className="hidden md:block shrink-0 mt-1 text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing select-none"
                    title="Arrastar para reordenar"
                    aria-hidden="true"
                  >
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" /></svg>
                  </span>
                )}
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
                {/* ↑↓ for touch screens, where drag-and-drop isn't available */}
                {canReorder && items.length > 1 && (
                  <div className="md:hidden flex flex-col shrink-0 -my-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={pending || i === 0}
                      aria-label="Mover tarefa para cima"
                      className="p-1 text-gray-300 hover:text-[#667470] disabled:opacity-30 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={pending || i === items.length - 1}
                      aria-label="Mover tarefa para baixo"
                      className="p-1 text-gray-300 hover:text-[#667470] disabled:opacity-30 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                  </div>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => { setAdding(false); setEditingId(task.id); }}
                    aria-label="Editar tarefa"
                    className="shrink-0 p-1 -m-1 text-gray-300 hover:text-[#667470] transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && adding && (
        <div className="px-4 py-3 border-t border-gray-50">
          <TaskForm
            tourId={tourId}
            onSaved={(task) => {
              replaceItems([...items, task]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
    </section>
  );
}

function TaskForm({
  tourId, task, onSaved, onDeleted, onCancel,
}: {
  tourId: string;
  /** When set, the form edits this task; otherwise it creates a new one. */
  task?: SaleTask;
  onSaved: (task: SaleTask) => void;
  onDeleted?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [role, setRole] = useState(task?.role ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const data = {
      name,
      description,
      role: role || null,
      priority: priority || null,
      dueDate: dueDate || null,
    };
    const result: { id?: string; error?: string } = task
      ? await updateSaleTaskAction(tourId, task.id, data)
      : await addSaleTaskAction(tourId, data);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const fields = {
      name: name.trim(),
      description: description.trim(),
      role: role || null,
      priority: priority || null,
      dueDate: dueDate || null,
    };
    if (task) {
      onSaved({ ...task, ...fields });
    } else {
      onSaved({
        id: result.id ?? crypto.randomUUID(),
        ...fields,
        status: "To do",
        categoria: [],
        fileUrl: null,
        teamMemberId: null,
        teamMemberName: null,
      });
    }
  }

  async function handleDelete() {
    if (!task || !confirm(`Eliminar a tarefa "${task.name}"?`)) return;
    setSaving(true);
    setError(null);
    const result = await deleteSaleTaskAction(tourId, task.id);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDeleted?.();
  }

  return (
    <div className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da tarefa" className={inputCls} autoFocus={!!task} />
      <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className={`${inputCls} resize-none`} />
      <div className="grid grid-cols-3 gap-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} bg-white`}>
          {/* Tasks without a role aren't listed, so an existing task must keep one. */}
          {!task && <option value="">Sem função</option>}
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
        {task && (
          <button onClick={handleDelete} disabled={saving} className="ml-auto text-red-500 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
