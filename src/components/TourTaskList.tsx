"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  Bernardo:    "bg-indigo-50 text-indigo-600 border-indigo-100",
  "António":   "bg-indigo-50 text-indigo-600 border-indigo-100",
  Manel:       "bg-indigo-50 text-indigo-600 border-indigo-100",
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const dragStartRef = useRef<SaleTask[] | null>(null);
  // Swallows the click that follows a drag release, so it doesn't open the editor.
  const justDraggedRef = useRef(false);

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

  // Pointer-based drag (works for mouse and touch). Listeners live on the
  // window because reordering moves the row in the DOM, which would drop
  // pointer capture on the handle.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (dragId === null) return;

    function onMove(e: PointerEvent) {
      const y = e.clientY;
      // Scroll the page when dragging near the top/bottom edge of the viewport.
      const edge = 80;
      if (y < edge) window.scrollBy(0, -12);
      else if (y > window.innerHeight - edge) window.scrollBy(0, 12);

      const current = itemsRef.current;
      const from = current.findIndex((t) => t.id === dragId);
      const over = current.findIndex((t) => {
        const rect = rowRefs.current.get(t.id)?.getBoundingClientRect();
        return rect ? y >= rect.top && y <= rect.bottom : false;
      });
      if (from === -1 || over === -1 || over === from) return;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(over, 0, moved);
      itemsRef.current = next;
      setItems(next);
    }

    function onEnd() {
      setDragId(null);
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      const previous = dragStartRef.current;
      dragStartRef.current = null;
      const next = itemsRef.current;
      if (!previous || previous.every((t, i) => t.id === next[i]?.id)) return;
      persistOrder(next, previous);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  function handleDragStart(e: React.PointerEvent, id: string) {
    if (!canReorder || pending) return;
    e.preventDefault();
    dragStartRef.current = items;
    setDragId(id);
  }

  function startEditing(id: string) {
    if (justDraggedRef.current) return;
    setAdding(false);
    setEditingId(id);
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
          {items.map((task) => {
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
                ref={(el) => {
                  if (el) rowRefs.current.set(task.id, el);
                  else rowRefs.current.delete(task.id);
                }}
                onClick={canManage && dragId === null ? () => startEditing(task.id) : undefined}
                className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                  dragId === task.id ? "bg-gray-50 shadow-inner relative z-10" : ""
                } ${canManage && dragId === null ? "cursor-pointer hover:bg-gray-50/60" : ""}`}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(task); }}
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
                      onClick={(e) => { e.stopPropagation(); toggle(task); }}
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
                {canReorder && items.length > 1 && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onPointerDown={(e) => handleDragStart(e, task.id)}
                    onClick={(e) => e.stopPropagation()}
                    title="Arrastar para reordenar"
                    aria-label="Arrastar para reordenar"
                    className={`shrink-0 -my-1 -mr-2 p-2 text-gray-300 hover:text-gray-400 select-none touch-none ${
                      dragId === task.id ? "cursor-grabbing text-[#667470]" : "cursor-grab"
                    }`}
                  >
                    <svg width="12" height="18" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" /></svg>
                  </span>
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
