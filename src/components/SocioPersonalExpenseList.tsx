"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSocioTransferenciaFeitaAction } from "@/actions/transactions";
import type { Transaction } from "@/lib/notion";
import { PARTNERS, ownershipForDate } from "@/lib/constants";

export function SocioPersonalExpenseList({ expenses }: { expenses: Transaction[] }) {
  if (expenses.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-[#32373c]">Despesas Pessoais a Redistribuir</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Despesas pagas com o cartão da empresa para uso pessoal de um sócio
        </p>
      </div>
      <ul className="divide-y divide-gray-50">
        {expenses.map((e) => (
          <SocioExpenseRow key={e.id} expense={e} />
        ))}
      </ul>
    </section>
  );
}

function SocioExpenseRow({ expense }: { expense: Transaction }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  const [done, setDone] = useState(!!expense.socioTransferenciaFeita);

  const payer = expense.socioPessoal ?? "";
  const ownership = ownershipForDate(expense.date);
  const owed = PARTNERS.filter((p) => p !== payer).map((p) => ({
    name: p,
    amount: ((ownership[p] ?? 0) / 100) * expense.taxFree,
  }));

  async function handleToggle() {
    const next = !done;
    setMarking(true);
    setDone(next);
    try {
      await setSocioTransferenciaFeitaAction(expense.id, next);
      router.refresh();
    } catch {
      setDone(!next);
    } finally {
      setMarking(false);
    }
  }

  return (
    <li className={`px-5 py-3.5 flex items-start justify-between gap-3 transition-opacity ${done ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#32373c] truncate">
          {expense.supplier || "—"} <span className="text-gray-400 font-normal">· {payer}</span>
        </p>
        <p className="text-xs text-gray-400">
          {expense.date ?? "—"} · €{expense.taxFree.toFixed(2)} sem IVA
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {owed.map((o) => `${o.name}: €${o.amount.toFixed(2)}`).join(" · ")}
        </p>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
        <div
          onClick={marking ? undefined : handleToggle}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            done ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:bg-gray-50 cursor-pointer"
          }`}
        >
          {done && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <span className="text-xs font-medium text-gray-600">Feito</span>
      </label>
    </li>
  );
}
