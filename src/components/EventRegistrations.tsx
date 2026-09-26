"use client";

import { useMemo, useState, useTransition } from "react";
import type { SaleRegistration, SaleRegistrationInput } from "@/lib/notion";
import {
  REGISTRATION_TICKET_TYPES,
  REGISTRATION_PAYMENT_STATUSES,
  REGISTRATION_INVOICE_STATUSES,
  REGISTRATION_PAYMENT_METHODS,
} from "@/lib/constants";
import {
  addSaleRegistrationsAction,
  updateSaleRegistrationAction,
  deleteSaleRegistrationAction,
} from "@/actions/registrations";

const TICKET_COLORS: Record<string, string> = {
  Bilhete: "bg-[#667470]/10 text-[#667470] border-[#667470]/20",
  Convite: "bg-purple-50 text-purple-600 border-purple-100",
};
const PAYMENT_COLORS: Record<string, string> = {
  "Feito":     "bg-emerald-100 text-emerald-700",
  "Não Feito": "bg-red-100 text-red-700",
};
const INVOICE_COLORS: Record<string, string> = {
  "Feito":       "bg-emerald-100 text-emerald-700",
  "Não Feito":   "bg-amber-100 text-amber-700",
  "Não precisa": "bg-gray-100 text-gray-500",
};

type Filter = "all" | "unpaid" | "invoice" | "dietary";
const FILTER_LABELS: Record<Filter, string> = {
  all: "Todos",
  unpaid: "Por pagar",
  invoice: "Fatura por enviar",
  dietary: "Restrições",
};

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#32373c] bg-white placeholder:text-gray-400 focus:outline-none focus:border-[#667470] transition-colors";

const EMPTY: SaleRegistrationInput = {
  name: "",
  ticketType: "Bilhete",
  paymentStatus: "Não Feito",
  paymentMethod: "",
  paymentDate: null,
  invoiceStatus: "Não Feito",
  dietaryRestrictions: "",
  email: "",
  phone: "",
  notes: "",
};

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

function isUnpaid(r: SaleRegistration): boolean {
  return r.ticketType === "Bilhete" && r.paymentStatus !== "Feito";
}

function toInput(r: SaleRegistration): SaleRegistrationInput {
  return {
    name: r.name,
    ticketType: r.ticketType,
    paymentStatus: r.paymentStatus,
    paymentMethod: r.paymentMethod,
    paymentDate: r.paymentDate,
    invoiceStatus: r.invoiceStatus,
    dietaryRestrictions: r.dietaryRestrictions,
    email: r.email,
    phone: r.phone,
    notes: r.notes,
  };
}

function csvCell(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCsv(items: SaleRegistration[], filename: string, showPayment: boolean) {
  const header = [
    "#", "Nome", "Tipo",
    ...(showPayment ? ["Pagamento", "Método de Pagamento", "Data do Pagamento"] : []),
    "Fatura Enviada", "Restrições Alimentares", "Email", "Telefone", "Notas",
  ];
  const lines = items.map((r, i) => [
    String(i + 1), r.name, r.ticketType,
    ...(showPayment ? [r.ticketType === "Convite" ? "" : r.paymentStatus, r.paymentMethod, r.paymentDate ?? ""] : []),
    r.invoiceStatus, r.dietaryRestrictions, r.email, r.phone, r.notes,
  ].map(csvCell).join(","));
  // BOM so Excel opens accents correctly.
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EventRegistrations({
  tourId, saleRef, registrations, numGuests, canManage, showPayment,
}: {
  tourId: string;
  saleRef: string;
  registrations: SaleRegistration[];
  numGuests: number;
  canManage: boolean;
  /** Payment status/method/date — Admin only. */
  showPayment: boolean;
}) {
  const [items, setItems] = useState(registrations);
  const [pending, startTransition] = useTransition();
  const [errorId, setErrorId] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "add" | "bulk">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    const bilhetes = items.filter((r) => r.ticketType === "Bilhete");
    return {
      bilhetes: bilhetes.length,
      convites: items.length - bilhetes.length,
      paid: bilhetes.filter((r) => r.paymentStatus === "Feito").length,
      invoicePending: items.filter((r) => r.invoiceStatus === "Não Feito").length,
      dietary: items.filter((r) => r.dietaryRestrictions).length,
    };
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .map((r, i) => ({ r, n: i + 1 }))
      .filter(({ r }) => {
        if (filter === "unpaid" && !isUnpaid(r)) return false;
        if (filter === "invoice" && r.invoiceStatus !== "Não Feito") return false;
        if (filter === "dietary" && !r.dietaryRestrictions) return false;
        return !q || r.name.toLowerCase().includes(q);
      });
  }, [items, filter, query]);

  // Optimistic single-field change from a badge tap; reverts on error.
  function quickUpdate(reg: SaleRegistration, patch: Partial<SaleRegistrationInput>) {
    const updated = { ...reg, ...patch };
    const previous = items;
    setErrorId(null);
    setItems(items.map((r) => (r.id === reg.id ? updated : r)));
    startTransition(async () => {
      const result = await updateSaleRegistrationAction(tourId, reg.id, toInput(updated));
      if (result.error) {
        setErrorId(reg.id);
        setItems(previous);
      }
    });
  }

  function togglePayment(reg: SaleRegistration) {
    const paid = reg.paymentStatus !== "Feito";
    quickUpdate(reg, {
      paymentStatus: paid ? "Feito" : "Não Feito",
      paymentDate: paid ? (reg.paymentDate ?? todayISO()) : reg.paymentDate,
    });
  }

  function cycleInvoice(reg: SaleRegistration) {
    const i = REGISTRATION_INVOICE_STATUSES.indexOf(reg.invoiceStatus);
    quickUpdate(reg, { invoiceStatus: REGISTRATION_INVOICE_STATUSES[(i + 1) % REGISTRATION_INVOICE_STATUSES.length] });
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Inscrições
          <span className="ml-2 text-gray-400 font-normal">
            {items.length}{numGuests > 0 ? ` / ${numGuests} pax` : ""}
          </span>
        </h2>
        {canManage && (
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => exportCsv(items, `Participantes - ${saleRef || tourId}.csv`, showPayment)}
                className="text-xs text-gray-400 hover:text-[#32373c] font-medium"
              >
                Exportar
              </button>
            )}
            {mode === "idle" && (
              <>
                <button type="button" onClick={() => { setEditingId(null); setMode("bulk"); }} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
                  Colar lista
                </button>
                <button type="button" onClick={() => { setEditingId(null); setMode("add"); }} className="text-xs text-[#667470] hover:text-[#32373c] font-medium">
                  + Adicionar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {canManage && items.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-50 space-y-3">
          <div className={`grid gap-2 ${showPayment ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <Stat label="Bilhetes" value={String(stats.bilhetes)} />
            <Stat label="Convites" value={String(stats.convites)} />
            {showPayment && (
              <Stat
                label="Pagos"
                value={`${stats.paid}/${stats.bilhetes}`}
                color={stats.paid === stats.bilhetes ? "text-emerald-600" : "text-red-500"}
              />
            )}
            <Stat
              label="Faturas por enviar"
              value={String(stats.invoicePending)}
              color={stats.invoicePending === 0 ? "text-emerald-600" : "text-amber-600"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(FILTER_LABELS) as Filter[]).filter((f) => showPayment || f !== "unpaid").map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filter === f ? "bg-[#32373c] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {FILTER_LABELS[f]}
                {f === "unpaid" && ` (${stats.bilhetes - stats.paid})`}
                {f === "invoice" && ` (${stats.invoicePending})`}
                {f === "dietary" && ` (${stats.dietary})`}
              </button>
            ))}
            {items.length > 10 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Procurar nome…"
                className="ml-auto border border-gray-200 rounded-full px-3 py-1 text-xs text-[#32373c] placeholder:text-gray-400 focus:outline-none focus:border-[#667470] w-36"
              />
            )}
          </div>
        </div>
      )}

      {canManage && mode === "add" && (
        <div className="px-4 py-3 border-b border-gray-50">
          <RegistrationForm
            tourId={tourId}
            showPayment={showPayment}
            onSaved={(reg) => { setItems([...items, reg]); setMode("idle"); }}
            onCancel={() => setMode("idle")}
          />
        </div>
      )}

      {canManage && mode === "bulk" && (
        <div className="px-4 py-3 border-b border-gray-50">
          <BulkAddForm
            tourId={tourId}
            onSaved={(regs) => { setItems([...items, ...regs]); setMode("idle"); }}
            onCancel={() => setMode("idle")}
          />
        </div>
      )}

      {items.length === 0 ? (
        mode === "idle" && <div className="px-4 py-6 text-center text-sm text-gray-400">Ainda sem inscrições neste evento</div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma inscrição corresponde ao filtro</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {visible.map(({ r, n }) => {
            if (canManage && editingId === r.id) {
              return (
                <li key={r.id} className="px-4 py-3">
                  <RegistrationForm
                    tourId={tourId}
                    showPayment={showPayment}
                    registration={r}
                    onSaved={(updated) => { setItems(items.map((x) => (x.id === updated.id ? updated : x))); setEditingId(null); }}
                    onDeleted={() => { setItems(items.filter((x) => x.id !== r.id)); setEditingId(null); }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              );
            }
            return (
              <li key={r.id} className="px-4 py-3 flex items-start gap-3">
                <span className="w-6 text-xs text-gray-400 font-medium text-right shrink-0 mt-0.5">{n}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#32373c]">{r.name}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`text-xs border px-1.5 py-0.5 rounded-md font-medium ${TICKET_COLORS[r.ticketType]}`}>
                      {r.ticketType}
                    </span>
                    {showPayment && r.ticketType === "Bilhete" && (
                      <button
                        type="button"
                        onClick={() => togglePayment(r)}
                        disabled={pending}
                        title="Alternar pagamento"
                        className={`text-xs px-2 py-0.5 rounded-full font-medium disabled:opacity-50 ${PAYMENT_COLORS[r.paymentStatus]}`}
                      >
                        {r.paymentStatus === "Feito" ? "Pago" : "Por pagar"}
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => cycleInvoice(r)}
                        disabled={pending}
                        title="Alternar estado da fatura"
                        className={`text-xs px-2 py-0.5 rounded-full font-medium disabled:opacity-50 ${INVOICE_COLORS[r.invoiceStatus]}`}
                      >
                        Fatura: {r.invoiceStatus}
                      </button>
                    )}
                    {showPayment && r.paymentMethod && <span className="text-xs text-gray-400">{r.paymentMethod}</span>}
                    {showPayment && r.paymentDate && <span className="text-xs text-gray-400">{formatDate(r.paymentDate)}</span>}
                  </div>
                  {r.dietaryRestrictions && (
                    <p className="text-xs font-bold text-red-600 mt-1.5 whitespace-pre-line">🍽️ {r.dietaryRestrictions}</p>
                  )}
                  {canManage && (r.email || r.phone) && (
                    <p className="text-xs text-gray-400 mt-1">{[r.email, r.phone].filter(Boolean).join(" · ")}</p>
                  )}
                  {canManage && r.notes && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{r.notes}</p>}
                  {errorId === r.id && <p className="text-xs text-red-500 font-medium mt-1">Erro ao guardar, tenta novamente</p>}
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => { setMode("idle"); setEditingId(r.id); }}
                    aria-label="Editar inscrição"
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
    </section>
  );
}

function Stat({ label, value, color = "text-[#32373c]" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

function RegistrationForm({
  tourId, showPayment, registration, onSaved, onDeleted, onCancel,
}: {
  tourId: string;
  showPayment: boolean;
  /** When set, the form edits this registration; otherwise it creates a new one. */
  registration?: SaleRegistration;
  onSaved: (registration: SaleRegistration) => void;
  onDeleted?: () => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<SaleRegistrationInput>(registration ? toInput(registration) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SaleRegistrationInput>(key: K, value: SaleRegistrationInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function setTicketType(ticketType: SaleRegistrationInput["ticketType"]) {
    // Invitations aren't paid for and don't need an invoice.
    setData((d) => ticketType === "Convite"
      ? { ...d, ticketType, invoiceStatus: "Não precisa" }
      : { ...d, ticketType, invoiceStatus: d.invoiceStatus === "Não precisa" ? "Não Feito" : d.invoiceStatus });
  }

  function setPaymentStatus(paymentStatus: SaleRegistrationInput["paymentStatus"]) {
    setData((d) => ({ ...d, paymentStatus, paymentDate: paymentStatus === "Feito" ? (d.paymentDate ?? todayISO()) : d.paymentDate }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result: { ids?: string[]; error?: string } = registration
      ? await updateSaleRegistrationAction(tourId, registration.id, data)
      : await addSaleRegistrationsAction(tourId, [data]);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const saved = { ...data, name: data.name.trim(), dietaryRestrictions: data.dietaryRestrictions.trim() };
    onSaved({ id: registration?.id ?? result.ids?.[0] ?? crypto.randomUUID(), ...saved });
  }

  async function handleDelete() {
    if (!registration || !confirm(`Eliminar a inscrição de "${registration.name}"?`)) return;
    setSaving(true);
    setError(null);
    const result = await deleteSaleRegistrationAction(tourId, registration.id);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDeleted?.();
  }

  const isInvite = data.ticketType === "Convite";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do participante" className={inputCls} autoFocus />
        <select value={data.ticketType} onChange={(e) => setTicketType(e.target.value as SaleRegistrationInput["ticketType"])} className={inputCls}>
          {REGISTRATION_TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {showPayment && !isInvite && (
        <div className="grid grid-cols-3 gap-2">
          <select value={data.paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as SaleRegistrationInput["paymentStatus"])} className={inputCls} aria-label="Pagamento">
            {REGISTRATION_PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s === "Feito" ? "Pago" : "Por pagar"}</option>)}
          </select>
          <input
            list="registration-payment-methods"
            value={data.paymentMethod}
            onChange={(e) => set("paymentMethod", e.target.value)}
            placeholder="Método"
            className={inputCls}
          />
          <datalist id="registration-payment-methods">
            {REGISTRATION_PAYMENT_METHODS.map((m) => <option key={m} value={m} />)}
          </datalist>
          <input type="date" value={data.paymentDate ?? ""} onChange={(e) => set("paymentDate", e.target.value || null)} className={inputCls} aria-label="Data do pagamento" />
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
        <label className="text-xs text-gray-500">Fatura enviada</label>
        <select value={data.invoiceStatus} onChange={(e) => set("invoiceStatus", e.target.value as SaleRegistrationInput["invoiceStatus"])} className={inputCls}>
          {REGISTRATION_INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <input value={data.dietaryRestrictions} onChange={(e) => set("dietaryRestrictions", e.target.value)} placeholder="Restrições alimentares (opcional)" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <input type="email" value={data.email} onChange={(e) => set("email", e.target.value)} placeholder="Email (opcional)" className={inputCls} />
        <input type="tel" value={data.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Telefone (opcional)" className={inputCls} />
      </div>
      <textarea rows={2} value={data.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notas (opcional)" className={`${inputCls} resize-none`} />
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !data.name.trim()} className="bg-[#32373c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
          {saving ? "A guardar…" : "Guardar"}
        </button>
        <button onClick={onCancel} disabled={saving} className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        {registration && (
          <button onClick={handleDelete} disabled={saving} className="ml-auto text-red-500 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

/** Paste one name per line (e.g. a column copied from a spreadsheet) to register many people at once. */
function BulkAddForm({
  tourId, onSaved, onCancel,
}: {
  tourId: string;
  onSaved: (registrations: SaleRegistration[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [ticketType, setTicketType] = useState<SaleRegistrationInput["ticketType"]>("Bilhete");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Strips a leading row number ("12 Rita Neves", "12. Rita Neves") copied along with the name.
  const names = text
    .split(/\r?\n/)
    .map((line) => line.split("\t")[0].replace(/^\s*\d+[.)-]?\s+/, "").trim())
    .filter(Boolean);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const inputs: SaleRegistrationInput[] = names.map((name) => ({
      ...EMPTY,
      name,
      ticketType,
      invoiceStatus: ticketType === "Convite" ? "Não precisa" : "Não Feito",
    }));
    const result = await addSaleRegistrationsAction(tourId, inputs);
    setSaving(false);
    if (result.error || !result.ids) {
      setError(result.error ?? "Erro ao guardar");
      return;
    }
    onSaved(inputs.map((input, i) => ({ id: result.ids![i], ...input })));
  }

  return (
    <div className="space-y-2">
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Um nome por linha\nMaria Silva\nJoão Pereira"}
        className={`${inputCls} resize-y`}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Tipo</label>
        <select value={ticketType} onChange={(e) => setTicketType(e.target.value as SaleRegistrationInput["ticketType"])} className={`${inputCls} w-auto`}>
          {REGISTRATION_TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{names.length} {names.length === 1 ? "nome" : "nomes"}</span>
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || names.length === 0} className="bg-[#32373c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-[#1a2018] transition-colors">
          {saving ? "A guardar…" : `Adicionar ${names.length || ""}`.trim()}
        </button>
        <button onClick={onCancel} disabled={saving} className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}
