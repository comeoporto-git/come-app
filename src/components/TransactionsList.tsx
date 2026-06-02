"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { EditExpenseModal } from "./EditExpenseModal";
import { EditEarningModal } from "./EditEarningModal";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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

export function TransactionsList({
  transactions,
  fornecedores,
  year,
  month,
}: {
  transactions: Transaction[];
  fornecedores: Fornecedor[];
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>("Todas");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [editing, setEditing]           = useState<Transaction | null>(null);

  function navigate(y: number, m: number) {
    router.push(`?year=${y}&month=${m}`);
  }

  function prevMonth() {
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y--; }
    navigate(y, m);
  }

  function nextMonth() {
    let m = month + 1, y = year;
    if (m > 12) { m = 1; y++; }
    navigate(y, m);
  }

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const isEarning = t.supplier.startsWith("IN -");

      if (typeFilter === "Despesas" && isEarning) return false;
      if (typeFilter === "Receitas" && !isEarning) return false;

      if (statusFilter === "Pendentes") {
        if (t.status !== "Pending Payment" && t.status !== "Pending Receipt") return false;
      } else if (statusFilter === "Paid") {
        if (t.status !== "Paid") return false;
      } else if (statusFilter === "Em Falta") {
        if (t.status !== "Flag: Missing Bank Entry") return false;
      }

      if (search) {
        const q = search.toLowerCase();
        const matches =
          t.supplier.toLowerCase().includes(q) ||
          t.invoiceId.toLowerCase().includes(q) ||
          (t.tourName ?? "").toLowerCase().includes(q);
        if (!matches) return false;
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
      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white/20 rounded-2xl px-4 py-3">
        <button
          onClick={prevMonth}
          className="text-white/70 hover:text-white transition-colors text-lg font-bold w-8 text-center"
        >
          ‹
        </button>
        <span className="text-white font-semibold text-sm">
          {MONTHS_PT[month - 1]} {year}
        </span>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className="text-white/70 hover:text-white transition-colors text-lg font-bold w-8 text-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>

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
              typeFilter === t
                ? "bg-white text-[#32373c]"
                : "bg-white/25 text-white hover:bg-white/35"
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
              statusFilter === s
                ? "bg-white text-[#32373c]"
                : "bg-white/20 text-white/80 hover:bg-white/30"
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
          <div className="py-12 text-center text-sm text-gray-400">
            Sem transações
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((tx) => {
              const isEarning = tx.supplier.startsWith("IN -");
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
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 font-bold ${
                      isEarning ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                    }`}
                  >
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
                        <span className="text-xs text-gray-400 truncate">Fatura: {tx.invoiceId}</span>
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

      <p className="text-center text-xs text-white/40 pb-4">{filtered.length} de {transactions.length} transações</p>

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
