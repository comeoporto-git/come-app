"use client";

import { useState } from "react";
import type { ServiceDetail } from "@/lib/notion";
import { SERVICE_TEAM_ROLES, TASK_ROLE_OPTIONS, WEEKDAY_LABELS } from "@/lib/constants";
import { getOpenStatusForDate } from "@/lib/restaurantOpenStatus";
import {
  updateServiceCoreAction,
  updateServicePricingAction,
  addServiceStepAction,
  updateServiceStepAction,
  deleteServiceStepAction,
  addServiceTaskAction,
  updateServiceTaskAction,
  deleteServiceTaskAction,
  createRestaurantAction,
  updateRestaurantHoursAction,
  unlinkServiceRestaurantAction,
} from "@/actions/services";

type Props = {
  service: ServiceDetail;
  canEdit: boolean;   // Admin-only actions: pricing, tasks, editing core/steps/restaurants
  showAdminSections: boolean; // Price per pax + List of tasks
};

function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}min`;
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#32373c] bg-white placeholder:text-gray-400 focus:outline-none focus:border-[#667470] transition-colors";

export function ServiceCatalogDetail({ service, canEdit, showAdminSections }: Props) {
  return (
    <div className="space-y-6">
      <CoreSection service={service} canEdit={canEdit} />
      <StepsSection service={service} canEdit={canEdit} />
      {showAdminSections && <PricingSection service={service} canEdit={canEdit} />}
      {showAdminSections && <TasksSection service={service} canEdit={canEdit} />}
      <RestaurantsSection service={service} canEdit={canEdit} />
    </div>
  );
}

// ── Core info: name, type, description, duration, required team ──────────────

function CoreSection({ service, canEdit }: { service: ServiceDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(service.name);
  const [type, setType] = useState(service.type);
  const [description, setDescription] = useState(service.description);
  const [duration, setDuration] = useState(service.durationMinutes ? String(service.durationMinutes) : "");
  const [equipa, setEquipa] = useState<string[]>(service.equipa);

  function toggleRole(role: string) {
    setEquipa((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateServiceCoreAction(service.id, {
      name: name.trim(),
      type: type.trim(),
      description: description.trim(),
      durationMinutes: duration ? Number(duration) : null,
      equipa,
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else { window.location.reload(); }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#32373c]">Detalhes</h2>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
            Editar
          </button>
        )}
      </div>
      <div className="px-5 py-4 space-y-4">
        {!editing ? (
          <>
            <div>
              <p className="text-xs text-gray-500 mb-1">Nome</p>
              <p className="text-sm font-semibold text-[#32373c]">{service.name}</p>
            </div>
            <div className="flex gap-6 flex-wrap">
              <div>
                <p className="text-xs text-gray-500 mb-1">Tipo</p>
                <p className="text-sm text-[#32373c] font-medium">{service.type || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Duração</p>
                <p className="text-sm text-[#32373c] font-medium">{formatDuration(service.durationMinutes)}</p>
              </div>
            </div>
            {service.description && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Descrição</p>
                <p className="text-sm text-[#32373c] whitespace-pre-line">{service.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">Equipa Necessária</p>
              {service.equipa.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {service.equipa.map((r) => (
                    <span key={r} className="text-xs bg-[#667470]/10 text-[#667470] border border-[#667470]/20 px-2 py-0.5 rounded-md font-medium">{r}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Nenhuma função definida</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                <input value={type} onChange={(e) => setType(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Duração (minutos)</label>
                <input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Equipa Necessária</label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_TEAM_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                      equipa.includes(r)
                        ? "bg-[#667470] text-white border-[#667470]"
                        : "bg-white text-gray-500 border-gray-200 hover:border-[#667470]/40"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#32373c] text-white text-xs font-semibold py-2 rounded-xl disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
                {saving ? "A guardar…" : "Guardar"}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving} className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ── Steps (visible to all roles) ───────────────────────────────────────────────

function StepsSection({ service, canEdit }: { service: ServiceDetail; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#32373c]">Passos do Serviço</h2>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
            + Adicionar
          </button>
        )}
      </div>
      {service.steps.length === 0 && !adding ? (
        <div className="px-5 py-6 text-center text-sm text-gray-400">Nenhum passo definido</div>
      ) : (
        <ol className="divide-y divide-gray-50">
          {service.steps.map((step, i) =>
            editingId === step.id ? (
              <li key={step.id} className="px-5 py-3">
                <StepForm
                  serviceId={service.id}
                  initialTitle={step.title}
                  initialDescription={step.description}
                  onDone={() => setEditingId(null)}
                  submit={(title, desc) => updateServiceStepAction(service.id, step.id, title, desc)}
                />
              </li>
            ) : (
              <li key={step.id} className="px-5 py-3 flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[#667470]/10 text-[#667470] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#32373c]">{step.title}</p>
                  {step.description && <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-line">{step.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => setEditingId(step.id)} className="text-xs text-gray-400 hover:text-[#667470]">Editar</button>
                    <DeleteButton onConfirm={() => deleteServiceStepAction(service.id, step.id)} />
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
      {adding && (
        <div className="px-5 py-3 border-t border-gray-50">
          <StepForm
            serviceId={service.id}
            initialTitle=""
            initialDescription=""
            onDone={() => setAdding(false)}
            submit={(title, desc) => addServiceStepAction(service.id, title, desc)}
          />
        </div>
      )}
    </section>
  );
}

function StepForm({
  initialTitle, initialDescription, initialRole = null, roleField = false, onDone, submit,
}: {
  serviceId: string;
  initialTitle: string;
  initialDescription: string;
  initialRole?: string | null;
  roleField?: boolean;
  onDone: () => void;
  submit: (title: string, description: string, role: string | null) => Promise<{ error?: string }>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [role, setRole] = useState(initialRole ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await submit(title, description, roleField ? (role || null) : null);
    setSaving(false);
    if (result.error) setError(result.error);
    else { window.location.reload(); }
  }

  return (
    <div className="space-y-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do passo" className={inputCls} />
      <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className={`${inputCls} resize-none`} />
      {roleField && (
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">Sem função responsável</option>
          {TASK_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="bg-[#32373c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
          {saving ? "A guardar…" : "Guardar"}
        </button>
        <button onClick={onDone} disabled={saving} className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function DeleteButton({ onConfirm }: { onConfirm: () => Promise<{ error?: string }> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="text-xs text-red-400 hover:text-red-600">Remover</button>;
  }
  return (
    <div className="flex gap-1 items-center">
      <button
        type="button"
        disabled={busy}
        onClick={async () => { setBusy(true); await onConfirm(); window.location.reload(); }}
        className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-md hover:bg-red-600 disabled:opacity-50"
      >
        Confirmar
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
    </div>
  );
}

// ── Pricing (Admin only) ───────────────────────────────────────────────────────

function PricingSection({ service, canEdit }: { service: ServiceDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pax23, setPax23] = useState(service.pax_2_3 ?? "");
  const [pax46, setPax46] = useState(service.pax_4_6 ?? "");
  const [pax7, setPax7] = useState(service.pax_7_plus ?? "");
  const [chef23, setChef23] = useState(service.valor_chef_2_3 ?? "");
  const [chef46, setChef46] = useState(service.valor_chef_4_6 ?? "");
  const [chef710, setChef710] = useState(service.valor_chef_7_10 ?? "");
  const [copa, setCopa] = useState(service.valor_copa ?? "");
  const [driver, setDriver] = useState(service.valor_driver ?? "");

  function num(v: string | number): number | null {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateServicePricingAction(service.id, {
      pax_2_3: num(pax23),
      pax_4_6: num(pax46),
      pax_7_plus: num(pax7),
      valor_chef_2_3: num(chef23),
      valor_chef_4_6: num(chef46),
      valor_chef_7_10: num(chef710),
      valor_copa: num(copa),
      valor_driver: num(driver),
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else { window.location.reload(); }
  }

  const money = (v: number | null) => (v === null ? "—" : `€${v}`);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#32373c]">Preço por Pax</h2>
          <p className="text-xs text-gray-400 mt-0.5">Admin</p>
        </div>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
            Editar
          </button>
        )}
      </div>
      <div className="px-5 py-4 space-y-4">
        {!editing ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <PriceTile label="2–3 pax" value={money(service.pax_2_3)} />
              <PriceTile label="4–6 pax" value={money(service.pax_4_6)} />
              <PriceTile label="7+ pax" value={money(service.pax_7_plus)} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Pagamento à equipa</p>
              <div className="grid grid-cols-2 gap-3">
                <PriceTile label="Chef 2–3" value={money(service.valor_chef_2_3)} small />
                <PriceTile label="Chef 4–6" value={money(service.valor_chef_4_6)} small />
                <PriceTile label="Chef 7–10" value={money(service.valor_chef_7_10)} small />
                <PriceTile label="Copa" value={money(service.valor_copa)} small />
                <PriceTile label="Driver" value={money(service.valor_driver)} small />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="2–3 pax (€)" value={pax23} onChange={setPax23} />
              <NumField label="4–6 pax (€)" value={pax46} onChange={setPax46} />
              <NumField label="7+ pax (€)" value={pax7} onChange={setPax7} />
            </div>
            <p className="text-xs text-gray-500 -mb-2">Pagamento à equipa</p>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Chef 2–3 (€)" value={chef23} onChange={setChef23} />
              <NumField label="Chef 4–6 (€)" value={chef46} onChange={setChef46} />
              <NumField label="Chef 7–10 (€)" value={chef710} onChange={setChef710} />
              <NumField label="Copa (€)" value={copa} onChange={setCopa} />
              <NumField label="Driver (€)" value={driver} onChange={setDriver} />
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#32373c] text-white text-xs font-semibold py-2 rounded-xl disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
                {saving ? "A guardar…" : "Guardar"}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving} className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function PriceTile({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`font-semibold text-[#32373c] ${small ? "text-sm" : "text-base"}`}>{value}</p>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string | number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type="number" min={0} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

// ── Tasks (Admin only) ──────────────────────────────────────────────────────────

const TASK_ROLE_COLORS: Record<string, string> = {
  Admin:         "bg-purple-50 text-purple-600 border-purple-100",
  "Super Guide": "bg-purple-50 text-purple-600 border-purple-100",
  Guide:         "bg-[#667470]/10 text-[#667470] border-[#667470]/20",
  Chef:          "bg-red-50 text-red-600 border-red-100",
  Driver:        "bg-slate-100 text-slate-600 border-slate-200",
  Logistics:     "bg-orange-50 text-orange-600 border-orange-100",
};

function TasksSection({ service, canEdit }: { service: ServiceDetail; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#32373c]">Lista de Tarefas</h2>
          <p className="text-xs text-gray-400 mt-0.5">Admin</p>
        </div>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
            + Adicionar
          </button>
        )}
      </div>
      {service.tasks.length === 0 && !adding ? (
        <div className="px-5 py-6 text-center text-sm text-gray-400">Nenhuma tarefa definida</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {service.tasks.map((task) =>
            editingId === task.id ? (
              <li key={task.id} className="px-5 py-3">
                <StepForm
                  serviceId={service.id}
                  initialTitle={task.name}
                  initialDescription={task.description}
                  initialRole={task.role}
                  roleField
                  onDone={() => setEditingId(null)}
                  submit={(name, desc, role) => updateServiceTaskAction(service.id, task.id, name, desc, role)}
                />
              </li>
            ) : (
              <li key={task.id} className="px-5 py-3 flex items-start gap-3">
                <span className="w-5 h-5 rounded border border-gray-200 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#32373c]">{task.name}</p>
                  {task.description && <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-line">{task.description}</p>}
                  {task.role && (
                    <span className={`inline-block text-xs border px-1.5 py-0.5 rounded-md font-medium mt-1.5 ${TASK_ROLE_COLORS[task.role] ?? "bg-gray-50 text-gray-500 border-gray-100"}`}>
                      {task.role}
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => setEditingId(task.id)} className="text-xs text-gray-400 hover:text-[#667470]">Editar</button>
                    <DeleteButton onConfirm={() => deleteServiceTaskAction(service.id, task.id)} />
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {adding && (
        <div className="px-5 py-3 border-t border-gray-50">
          <StepForm
            serviceId={service.id}
            initialTitle=""
            initialDescription=""
            roleField
            onDone={() => setAdding(false)}
            submit={(name, desc, role) => addServiceTaskAction(service.id, name, desc, role)}
          />
        </div>
      )}
    </section>
  );
}

// ── Suggested restaurants + weekly schedule ─────────────────────────────────────

function RestaurantsSection({ service, canEdit }: { service: ServiceDetail; canEdit: boolean }) {
  const [checkDate, setCheckDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const dateObj = checkDate ? new Date(checkDate + "T12:00:00") : new Date();

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[#32373c]">Restaurantes Sugeridos</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Ver estado em</label>
          <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
        </div>
      </div>
      {service.restaurants.length === 0 && !adding ? (
        <div className="px-5 py-6 text-center text-sm text-gray-400">Nenhum restaurante sugerido</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {service.restaurants.map((r) => {
            const status = getOpenStatusForDate(r.hours, dateObj);
            return (
              <li key={r.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#32373c]">{r.name}</p>
                    {r.address && <p className="text-xs text-gray-400 mt-0.5">{r.address}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${status.closed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {status.closed ? "Fechado" : "Aberto"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{status.label}</p>
                <WeeklyHours hours={r.hours} />
                {canEdit && (
                  <div className="mt-2 flex gap-3">
                    <RestaurantHoursEditor serviceId={service.id} restaurantId={r.id} hours={r.hours} />
                    <DeleteButton onConfirm={() => unlinkServiceRestaurantAction(service.id, r.id)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        adding ? (
          <div className="px-5 py-4 border-t border-gray-50">
            <NewRestaurantForm serviceId={service.id} onDone={() => setAdding(false)} />
          </div>
        ) : (
          <div className="px-5 py-3 border-t border-gray-50">
            <button type="button" onClick={() => setAdding(true)} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
              + Adicionar restaurante
            </button>
          </div>
        )
      )}
    </section>
  );
}

function WeeklyHours({ hours }: { hours: ServiceDetail["restaurants"][number]["hours"] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {WEEKDAY_LABELS.map((label, i) => {
        const row = hours.find((h) => h.dayOfWeek === i);
        const closed = !row || row.closed || !row.openTime || !row.closeTime;
        return (
          <span
            key={i}
            title={closed ? `${label}: fechado` : `${label}: ${row!.openTime!.slice(0, 5)}–${row!.closeTime!.slice(0, 5)}`}
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${closed ? "bg-gray-50 text-gray-300" : "bg-emerald-50 text-emerald-700"}`}
          >
            {label.slice(0, 3)}
          </span>
        );
      })}
    </div>
  );
}

function RestaurantHoursEditor({ serviceId, restaurantId, hours }: { serviceId: string; restaurantId: string; hours: ServiceDetail["restaurants"][number]["hours"] }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return <button type="button" onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-[#667470]">Editar horário</button>;
  }
  return <HoursForm serviceId={serviceId} restaurantId={restaurantId} initialHours={hours} onDone={() => setEditing(false)} />;
}

type DraftHour = { dayOfWeek: number; openTime: string; closeTime: string; closed: boolean };

function buildDraftHours(existing: ServiceDetail["restaurants"][number]["hours"]): DraftHour[] {
  return WEEKDAY_LABELS.map((_, i) => {
    const row = existing.find((h) => h.dayOfWeek === i);
    return {
      dayOfWeek: i,
      openTime: row?.openTime?.slice(0, 5) ?? "",
      closeTime: row?.closeTime?.slice(0, 5) ?? "",
      closed: row?.closed ?? true,
    };
  });
}

function HoursForm({
  serviceId, restaurantId, initialHours, onDone,
}: {
  serviceId: string;
  restaurantId: string;
  initialHours: ServiceDetail["restaurants"][number]["hours"];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<DraftHour[]>(buildDraftHours(initialHours));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<DraftHour>) {
    setDraft((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateRestaurantHoursAction(
      serviceId,
      restaurantId,
      draft.map((d) => ({ dayOfWeek: d.dayOfWeek, openTime: d.closed ? null : d.openTime || null, closeTime: d.closed ? null : d.closeTime || null, closed: d.closed })),
    );
    setSaving(false);
    if (result.error) setError(result.error);
    else { window.location.reload(); }
  }

  return (
    <div className="mt-2 border border-gray-100 rounded-xl p-3 space-y-1.5 w-full">
      {draft.map((d, i) => (
        <div key={d.dayOfWeek} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-gray-500 shrink-0">{WEEKDAY_LABELS[d.dayOfWeek]}</span>
          <label className="flex items-center gap-1 text-gray-400 shrink-0">
            <input type="checkbox" checked={!d.closed} onChange={(e) => update(i, { closed: !e.target.checked })} />
            Aberto
          </label>
          {!d.closed && (
            <>
              <input type="time" value={d.openTime} onChange={(e) => update(i, { openTime: e.target.value })} className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs" />
              <span className="text-gray-300">–</span>
              <input type="time" value={d.closeTime} onChange={(e) => update(i, { closeTime: e.target.value })} className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs" />
            </>
          )}
        </div>
      ))}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className="bg-[#32373c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
          {saving ? "A guardar…" : "Guardar horário"}
        </button>
        <button onClick={onDone} disabled={saving} className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function NewRestaurantForm({ serviceId, onDone }: { serviceId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<DraftHour[]>(buildDraftHours([]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<DraftHour>) {
    setDraft((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await createRestaurantAction(serviceId, {
      name, address, phone, notes,
      hours: draft.map((d) => ({ dayOfWeek: d.dayOfWeek, openTime: d.closed ? null : d.openTime || null, closeTime: d.closed ? null : d.closeTime || null, closed: d.closed })),
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else { window.location.reload(); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do restaurante *" className={inputCls} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className={inputCls} />
      </div>
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Morada" className={inputCls} />
      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" className={`${inputCls} resize-none`} />
      <div className="border border-gray-100 rounded-xl p-3 space-y-1.5">
        <p className="text-xs text-gray-500 mb-1">Horário semanal</p>
        {draft.map((d, i) => (
          <div key={d.dayOfWeek} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-gray-500 shrink-0">{WEEKDAY_LABELS[d.dayOfWeek]}</span>
            <label className="flex items-center gap-1 text-gray-400 shrink-0">
              <input type="checkbox" checked={!d.closed} onChange={(e) => update(i, { closed: !e.target.checked })} />
              Aberto
            </label>
            {!d.closed && (
              <>
                <input type="time" value={d.openTime} onChange={(e) => update(i, { openTime: e.target.value })} className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs" />
                <span className="text-gray-300">–</span>
                <input type="time" value={d.closeTime} onChange={(e) => update(i, { closeTime: e.target.value })} className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs" />
              </>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="bg-[#32373c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
          {saving ? "A guardar…" : "Guardar restaurante"}
        </button>
        <button onClick={onDone} disabled={saving} className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}
