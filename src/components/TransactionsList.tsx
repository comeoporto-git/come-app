"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { EditExpenseModal } from "./EditExpenseModal";
import { EditEarningModal } from "./EditEarningModal";

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function firstOfMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split("T")[0];
}

function firstOfYear(year = new Date().getFullYear()) {
  return `${year}-01-01`;
}

function lastOfYear(year: number) {
  return `${year}-12-31`;
}

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to   + "T00:00:00");
  const fy = f.getFullYear(), ty = t.getFullYear();
  const fm = MONTHS_SHORT[f.getMonth()], tm = MONTHS_SHORT[t.getMonth()];
  if (from === to) return `${f.getDate()} ${fm} ${fy}`;
  if (fy === ty) {
    if (f.getMonth() === t.getMonth())
      return `${f.getDate()}–${t.getDate()} ${tm} ${ty}`;
    return `${f.getDate()} ${fm} – ${t.getDate()} ${tm} ${ty}`;
  }
  return `${f.getDate()} ${fm} ${fy} – ${t.getDate()} ${tm} ${ty}`;
}

// ── Presets ───────────────────────────────────────────────────────────────────

function getPresets() {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear  = now.getFullYear() - 1;
  return [
    { label: "Hoje",           from: todayStr(),           to: todayStr() },
    { label: "Últimos 7 dias", from: daysAgo(6),           to: todayStr() },
    { label: "Últimos 30 dias",from: daysAgo(29),          to: todayStr() },
    { label: "Este mês",       from: firstOfMonth(now),    to: todayStr() },
    { label: "Último mês",     from: firstOfMonth(prevMonth), to: lastOfMonth(prevMonth) },
    { label: "Este ano",       from: firstOfYear(),        to: todayStr() },
    { label: "Último ano",     from: firstOfYear(prevYear), to: lastOfYear(prevYear) },
  ];
}

// ── DateRangeControl ──────────────────────────────────────────────────────────

function DateRangeControl({ from, to }: { from: string; to: string }) {
  const router  = useRouter();
  const [open, setOpen]         = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo,   setCustomTo]   = useState(to);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomFrom(from);
    setCustomTo(to);
  }, [from, to]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function navigate(f: string, t: string) {
    router.push(`?from=${f}&to=${t}`);
    setOpen(false);
  }

  const presets = getPresets();
  const activePreset = presets.find((p) => p.from === from && p.to === to);

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-white rounded-2xl px-4 py-3 text-sm font-semibold text-[#32373c] shadow-sm hover:bg-gray-50 active:scale-[0.99] transition-all"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <span>{activePreset?.label ?? formatRange(from, to)}</span>
        </span>
        <span className={`text-gray-400 text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20">
          {/* Preset grid */}
          <div className="p-3 grid grid-cols-2 gap-2">
            {presets.map((p) => {
              const active = p.from === from && p.to === to;
              return (
                <button
                  key={p.label}
                  onClick={() => navigate(p.from, p.to)}
                  className={`text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#667470] text-white"
                      : "bg-gray-50 text-[#32373c] hover:bg-[#667470]/10"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom range */}
          <div className="border-t border-gray-100 px-3 py-3 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Período personalizado</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">De</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#32373c] focus:outline-none focus:border-[#667470]/50"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Até</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayStr()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#32373c] focus:outline-none focus:border-[#667470]/50"
                />
              </div>
            </div>
            <button
              onClick={() => navigate(customFrom, customTo)}
              disabled={!customFrom || !customTo || customFrom > customTo}
              className="w-full bg-[#32373c] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-40 hover:bg-[#1a2018] transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status / colour maps ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Paid:                       "bg-green-100 text-green-700",
  "Pending Payment":          "bg-yellow-100 text-yellow-700",
  "Pending Receipt":          "bg-orange-100 text-orange-700",
  "Unmatched Bank Entry":     "bg-purple-100 text-purple-700",
  "Flag: Missing Bank Entry": "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  Paid:                       "Pago",
  "Pending Payment":          "Pagamento Pendente",
  "Pending Receipt":          "Recibo Pendente",
  "Unmatched Bank Entry":     "Sem Match Bancário",
  "Flag: Missing Bank Entry": "Entrada Em Falta",
};

type TypeFilter   = "Todas" | "Despesas" | "Receitas";
type StatusFilter = "Todos" | "Pendentes" | "Paid" | "Em Falta";

// ── Main component ────────────────────────────────────────────────────────────

export function TransactionsList({
  transactions,
  fornecedores,
  from,
  to,
}: {
  transactions: Transaction[];
  fornecedores: Fornecedor[];
  from: string;
  to: string;
}) {
  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>("Todas");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [editing, setEditing]           = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const isEarning = t.supplier.startsWith("IN -");
      if (typeFilter === "Despesas" && isEarning)  return false;
      if (typeFilter === "Receitas" && !isEarning) return false;
      if (statusFilter === "Pendentes" && t.status !== "Pending Payment" && t.status !== "Pending Receipt") return false;
      if (statusFilter === "Paid"     && t.status !== "Paid") return false;
      if (statusFilter === "Em Falta" && t.status !== "Flag: Missing Bank Entry") return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !t.supplier.toLowerCase().includes(q) &&
          !t.invoiceId.toLowerCase().includes(q) &&
          !(t.tourName ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, statusFilter, search]);

  const expenses = filtered.filter((t) => !t.supplier.startsWith("IN -"));
  const earnings = filtered.filter((t) =>  t.supplier.startsWith("IN -"));
  const totalOut = expenses.reduce((s, t) => s + Math.abs(t.totalCost), 0);
  const totalIn  = earnings.reduce((s, t) => s + Math.abs(t.totalCost), 0);

  return (
    <div className="space-y-4">
      {/* Date range control */}
      <DateRangeControl from={from} to={to} />

      {/* Search */}
      <input
        type="search"
        placeholder="Pesquisar fornecedor, fatura, serviço…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-white rounded-xl border border-transparent px-4 py-2.5 text-sm text-[#32373c] placeholder-gray-400 focus:outline-none focus:border-[#667470]/40"
      />

      {/* Type filter */}
      <div className="flex gap-2">
        {(["Todas", "Despesas", "Receitas"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              typeFilter === t ? "bg-white text-[#32373c]" : "bg-white/25 text-white hover:bg-white/35"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(["Todos", "Pendentes", "Paid", "Em Falta"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-white text-[#32373c]" : "bg-white/20 text-white/80 hover:bg-white/30"
            }`}
          >
            {s === "Paid" ? "Pago" : s}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-400 font-medium">Despesas</p>
          <p className="text-lg font-bold text-red-500 mt-0.5">-€{totalOut.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{expenses.length} transações</p>
        </div>
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-400 font-medium">Receitas</p>
          <p className="text-lg font-bold text-green-600 mt-0.5">+€{totalIn.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{earnings.length} transações</p>
        </div>
      </div>

      {/* Transaction list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Sem transações</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((tx) => {
              const isEarning  = tx.supplier.startsWith("IN -");
              const displayName = isEarning
                ? tx.supplier.replace(/^IN\s*-\s*/i, "") || "Receita"
                : tx.supplier || "—";
              const statusLabel = STATUS_LABELS[tx.status] ?? tx.status;
              const statusColor = STATUS_COLORS[tx.status] ?? "bg-gray-100 text-gray-500";

              return (
                <li
                  key={tx.id}
                  onClick={() => setEditing(tx)}
                  className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 font-bold ${
                    isEarning ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                  }`}>
                    {isEarning ? "+" : "-"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">{tx.date ?? "—"}</span>
                      {tx.tourName && (
                        <span className="text-xs text-[#667470] truncate max-w-[120px]">{tx.tourName}</span>
                      )}
                      {tx.invoiceId && (
                        <span className="text-xs text-gray-400">Fatura: {tx.invoiceId}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <p className={`text-sm font-semibold ${isEarning ? "text-green-600" : "text-red-500"}`}>
                      {isEarning ? "+" : "-"}€{Math.abs(tx.totalCost).toFixed(2)}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-white/40 pb-4">
        {filtered.length} de {transactions.length} transações
      </p>

      {editing && !editing.supplier.startsWith("IN -") && (
        <EditExpenseModal
          transaction={editing}
          tourId={editing.tourId ?? ""}
          fornecedores={fornecedores}
          userRole="Admin"
          onClose={() => setEditing(null)}
        />
      )}

      {editing && editing.supplier.startsWith("IN -") && (
        <EditEarningModal
          transaction={editing}
          tourId={editing.tourId ?? ""}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
