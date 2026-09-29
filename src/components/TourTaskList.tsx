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

/** Ids of the tasks under `parentId` (null = top-level), in list order. */
function siblingIds(list: SaleTask[], parentId: string | null): string[] {
  return list.filter((t) => (t.parentId ?? null) === parentId).map((t) => t.id);
}

/**
 * Moves task `id` to where `overId` is among its siblings (same parent),
 * leaving every other task — including other groups' subtasks — in place.
 */
function moveWithinGroup(list: SaleTask[], id: string, overId: string): SaleTask[] {
  const parentId = list.find((t) => t.id === id)?.parentId ?? null;
  const group = list.filter((t) => (t.parentId ?? null) === parentId);
  const from = group.findIndex((t) => t.id === id);
  const over = group.findIndex((t) => t.id === overId);
  if (from === -1 || over === -1 || from === over) return list;
  const [moved] = group.splice(from, 1);
  group.splice(over, 0, moved);
  let i = 0;
  return list.map((t) => ((t.parentId ?? null) === parentId ? group[i++] : t));
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
  // Parent task id whose "new subtask" form is open.
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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

  const topLevel = items.filter((t) => !t.parentId);
  const subtasksOf = (id: string) => items.filter((t) => t.parentId === id);

  const canReorder = canManage && editingId === null && addingSubtaskFor === null;

  // Saves the new order of one group (top-level tasks, or one task's
  // subtasks); restores `previous` if the server rejects it.
  function persistOrder(next: SaleTask[], previous: SaleTask[], parentId: string | null) {
    setReorderError(null);
    replaceItems(next);
    startTransition(async () => {
      const result = await reorderSaleTasksAction(tourId, siblingIds(next, parentId));
      if (result.error) {
        setReorderError("Erro ao reordenar, tenta novamente");
        replaceItems(previous);
      }
    });
  }

  // Pointer-based drag (works for mouse and touch). Listeners live on the
  // window because reordering moves the row in the DOM, which would drop
  // pointer capture on the handle. A task moves among its siblings: a
  // top-level task drags its subtasks along, a subtask stays in its parent.
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
      const parentId = current.find((t) => t.id === dragId)?.parentId ?? null;
      const overId = siblingIds(current, parentId).find((id) => {
        const rect = rowRefs.current.get(id)?.getBoundingClientRect();
        return rect ? y >= rect.top && y <= rect.bottom : false;
      });
      if (!overId || !dragId) return;
      const next = moveWithinGroup(current, dragId, overId);
      if (next === current) return;
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
      if (!previous) return;
      const parentId = next.find((t) => t.id === dragId)?.parentId ?? null;
      const prevIds = siblingIds(previous, parentId);
      const nextIds = siblingIds(next, parentId);
      if (prevIds.every((id, i) => id === nextIds[i])) return;
      persistOrder(next, previous, parentId);
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
    setAddingSubtaskFor(null);
    setEditingId(id);
  }

  function startAddingSubtask(parentId: string) {
    setAdding(false);
    setEditingId(null);
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
    setAddingSubtaskFor(parentId);
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const doneCount = topLevel.filter((t) => t.status === "Done").length;

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

  function renderEditor(task: SaleTask) {
    return (
      <TaskForm
        tourId={tourId}
        task={task}
        onSaved={(updated) => {
          replaceItems(items.map((t) => (t.id === updated.id ? updated : t)));
          setEditingId(null);
        }}
        onDeleted={() => {
          replaceItems(items.filter((t) => t.id !== task.id && t.parentId !== task.id));
          setEditingId(null);
        }}
        onAddSubtask={task.parentId ? undefined : () => startAddingSubtask(task.id)}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  function renderDragHandle(id: string, small: boolean) {
    return (
      <span
        role="button"
        tabIndex={-1}
        onPointerDown={(e) => handleDragStart(e, id)}
        onClick={(e) => e.stopPropagation()}
        title="Arrastar para reordenar"
        aria-label="Arrastar para reordenar"
        className={`shrink-0 -my-1 -mr-2 p-2 text-gray-300 hover:text-gray-400 select-none touch-none ${
          dragId === id ? "cursor-grabbing text-[#667470]" : "cursor-grab"
        }`}
      >
        <svg width={small ? 10 : 12} height={small ? 15 : 18} viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" /></svg>
      </span>
    );
  }

  function renderCheckbox(task: SaleTask, small: boolean) {
    const status = task.status ?? "To do";
    const isDone = status === "Done";
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(task); }}
        disabled={pending}
        aria-label={`Marcar tarefa como ${STATUS_LABELS[nextStatus(status)]}`}
        className={`${small ? "w-4 h-4" : "w-5 h-5"} rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors disabled:opacity-50 ${
          isDone ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-[#667470]"
        }`}
      >
        {isDone && (
          <svg className={`${small ? "w-2.5 h-2.5" : "w-3 h-3"} text-white`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </button>
    );
  }

  function renderBadges(task: SaleTask, parentRole?: string | null) {
    const status = task.status ?? "To do";
    return (
      <>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(task); }}
          disabled={pending}
          className={`text-xs px-2 py-0.5 rounded-full font-medium disabled:opacity-50 ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500"}`}
        >
          {STATUS_LABELS[status] ?? status}
        </button>
        {/* A subtask only shows its role when it differs from the parent's. */}
        {task.role && task.role !== parentRole && (
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
      </>
    );
  }

  function renderSubtasks(parent: SaleTask, subtasks: SaleTask[]) {
    const addingHere = canManage && addingSubtaskFor === parent.id;
    if ((subtasks.length === 0 || collapsed.has(parent.id)) && !addingHere) return null;
    return (
      <ul className="ml-12 mr-4 mb-3 border-l border-gray-100">
        {subtasks.map((sub) => {
          const isDone = sub.status === "Done";
          if (canManage && editingId === sub.id) {
            return <li key={sub.id} className="pl-3 py-2">{renderEditor(sub)}</li>;
          }
          return (
            <li
              key={sub.id}
              ref={(el) => {
                if (el) rowRefs.current.set(sub.id, el);
                else rowRefs.current.delete(sub.id);
              }}
              onClick={canManage && dragId === null ? () => startEditing(sub.id) : undefined}
              className={`pl-3 pr-2 py-2 flex items-start gap-2.5 rounded-r-lg transition-colors ${
                dragId === sub.id ? "bg-gray-50 shadow-inner relative z-10" : ""
              } ${canManage && dragId === null ? "cursor-pointer hover:bg-gray-50/60" : ""}`}
            >
              {renderCheckbox(sub, true)}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${isDone ? "text-gray-400 line-through" : "text-[#32373c]"}`}>{sub.name}</p>
                {sub.description && (
                  <p className={`text-xs mt-0.5 whitespace-pre-line ${isDone ? "text-gray-300" : "text-gray-500"}`}>{sub.description}</p>
                )}
                {(!isDone || sub.dueDate || sub.priority) && (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">{renderBadges(sub, parent.role)}</div>
                )}
                {errorId === sub.id && <p className="text-xs text-red-500 font-medium mt-1">Erro ao guardar, tenta novamente</p>}
              </div>
              {canReorder && subtasks.length > 1 && renderDragHandle(sub.id, true)}
            </li>
          );
        })}
        {addingHere && (
          <li className="pl-3 py-2">
            <TaskForm
              tourId={tourId}
              parent={parent}
              onSaved={(task) => {
                replaceItems([...items, task]);
                setAddingSubtaskFor(null);
              }}
              onCancel={() => setAddingSubtaskFor(null)}
            />
          </li>
        )}
        {canManage && !addingHere && (
          <li className="pl-3 py-1">
            <button
              type="button"
              onClick={() => startAddingSubtask(parent.id)}
              className="text-xs text-[#667470] hover:text-[#32373c] font-medium"
            >
              + Subtarefa
            </button>
          </li>
        )}
      </ul>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Tarefas</h2>
        <div className="flex items-center gap-3">
          {topLevel.length > 0 && <span className="text-xs text-gray-400">{doneCount}/{topLevel.length}</span>}
          {canManage && !adding && (
            <button type="button" onClick={() => { setEditingId(null); setAddingSubtaskFor(null); setAdding(true); }} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
              + Adicionar
            </button>
          )}
        </div>
      </div>
      {canManage && adding && (
        <div className="px-4 py-3 border-b border-gray-50">
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
      {reorderError && <p className="px-4 pt-3 text-xs text-red-500 font-medium">{reorderError}</p>}
      {topLevel.length === 0 && !adding ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma tarefa associada a este serviço</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {topLevel.map((task) => {
            const isDone = (task.status ?? "To do") === "Done";
            const subtasks = subtasksOf(task.id);
            const subtasksDone = subtasks.filter((t) => t.status === "Done").length;
            const isCollapsed = collapsed.has(task.id);
            return (
              <li
                key={task.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(task.id, el);
                  else rowRefs.current.delete(task.id);
                }}
                className={`transition-colors ${dragId === task.id ? "bg-gray-50 shadow-inner relative z-10" : ""}`}
              >
                {canManage && editingId === task.id ? (
                  <div className="px-4 py-3">{renderEditor(task)}</div>
                ) : (
                  <div
                    onClick={canManage && dragId === null ? () => startEditing(task.id) : undefined}
                    className={`px-4 py-3 flex items-start gap-3 ${canManage && dragId === null ? "cursor-pointer hover:bg-gray-50/60" : ""}`}
                  >
                    {renderCheckbox(task, false)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isDone ? "text-gray-400 line-through" : "text-[#32373c]"}`}>{task.name}</p>
                      {task.description && (
                        <p className={`text-sm mt-0.5 whitespace-pre-line ${isDone ? "text-gray-300" : "text-gray-500"}`}>{task.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {renderBadges(task)}
                        {subtasks.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleCollapsed(task.id); }}
                            aria-expanded={!isCollapsed}
                            aria-label={isCollapsed ? "Mostrar subtarefas" : "Esconder subtarefas"}
                            className={`text-xs border px-1.5 py-0.5 rounded-md font-medium flex items-center gap-1 ${
                              subtasksDone === subtasks.length ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-gray-50 text-gray-500 border-gray-100"
                            }`}
                          >
                            <svg className={`w-2.5 h-2.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                            {subtasksDone}/{subtasks.length}
                          </button>
                        )}
                      </div>
                      {errorId === task.id && <p className="text-xs text-red-500 font-medium mt-1">Erro ao guardar, tenta novamente</p>}
                    </div>
                    {canReorder && topLevel.length > 1 && renderDragHandle(task.id, false)}
                  </div>
                )}
                {renderSubtasks(task, subtasks)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TaskForm({
  tourId, task, parent, onSaved, onDeleted, onAddSubtask, onCancel,
}: {
  tourId: string;
  /** When set, the form edits this task; otherwise it creates a new one. */
  task?: SaleTask;
  /** When creating, makes the new task a subtask of this one. */
  parent?: SaleTask;
  onSaved: (task: SaleTask) => void;
  onDeleted?: () => void;
  /** Shown as "+ Subtarefa" when editing a top-level task. */
  onAddSubtask?: () => void;
  onCancel: () => void;
}) {
  const isSubtask = !!(task?.parentId ?? parent);
  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  // A new subtask starts with its parent's role (tasks without one aren't listed).
  const [role, setRole] = useState(task?.role ?? parent?.role ?? "");
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
      : await addSaleTaskAction(tourId, { ...data, parentId: parent?.id ?? null });
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
        parentId: parent?.id ?? null,
      });
    }
  }

  async function handleDelete() {
    const what = isSubtask ? "a subtarefa" : "a tarefa";
    const withSubtasks = isSubtask ? "" : " (e as suas subtarefas)";
    if (!task || !confirm(`Eliminar ${what} "${task.name}"${withSubtasks}?`)) return;
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
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isSubtask ? "Nome da subtarefa" : "Nome da tarefa"} className={inputCls} autoFocus={!!task || !!parent} />
      <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className={`${inputCls} resize-none`} />
      <div className="grid grid-cols-3 gap-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} bg-white`}>
          {/* Tasks without a role aren't listed, so an existing task must keep one. */}
          {!task && !parent && <option value="">Sem função</option>}
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
        {onAddSubtask && (
          <button onClick={onAddSubtask} disabled={saving} className="text-[#667470] text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            + Subtarefa
          </button>
        )}
        {task && (
          <button onClick={handleDelete} disabled={saving} className="ml-auto text-red-500 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
