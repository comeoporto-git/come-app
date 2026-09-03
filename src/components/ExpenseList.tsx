"use client";

import { useState } from "react";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { AddExpenseModal } from "./AddExpenseModal";
import { EditExpenseModal } from "./EditExpenseModal";

const STATUS_COLORS: Record<string, string> = {
  Paid: "bg-green-100 text-green-700",
  "Awaiting Reimbursement": "bg-yellow-100 text-yellow-700",
  Reimbursed: "bg-blue-100 text-blue-700",
  "Pending Receipt": "bg-orange-100 text-orange-700",
  "Unmatched Bank Entry": "bg-purple-100 text-purple-700",
  "Flag: Missing Bank Entry": "bg-red-100 text-red-700",
};

export function ExpenseList({
  transactions,
  tourId,
  isClosed,
  fornecedores = [],
  guideName,
  chefName,
  driverName,
  userRole = "Guide",
}: {
  transactions: Transaction[];
  tourId: string;
  isClosed: boolean;
  fornecedores?: Fornecedor[];
  guideName?: string;
  chefName?: string;
  driverName?: string;
  userRole?: string;
}) {
  const [pendingToFinish, setPendingToFinish] = useState<Transaction | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-sm">Sem despesas registadas</p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {transactions.map((tx) => (
          <li
            key={tx.id}
            onClick={() => !isClosed && setEditing(tx)}
            className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1 transition-colors ${
              !isClosed ? "cursor-pointer hover:border-[#667470]/30 active:scale-[0.99]" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-900 truncate">{tx.supplier}</p>
                  {tx.invoiceImageUrl && (
                    <span className="text-xs text-gray-400 shrink-0" title="Fatura anexada">📎</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{tx.date ?? "—"}</p>
                {(tx.whoPaid === "Guide" && guideName) && (
                  <p className="text-xs font-medium text-[#667470]">Pago por: {guideName}</p>
                )}
                {(tx.whoPaid === "Chef" && chefName) && (
                  <p className="text-xs font-medium text-[#667470]">Pago por: {chefName}</p>
                )}
                {(tx.whoPaid === "Driver" && driverName) && (
                  <p className="text-xs font-medium text-[#667470]">Pago por: {driverName}</p>
                )}
                {tx.whoPaid === "Bernardo" && (
                  <p className="text-xs font-medium text-[#667470]">Pago por: Bernardo Providência</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">€{Math.abs(tx.totalCost).toFixed(2)}</p>
                {(() => {
                  const isGuideEtc = tx.whoPaid === "Guide" || tx.whoPaid === "Chef" || tx.whoPaid === "Driver" || tx.whoPaid === "Bernardo";
                  // "Pending Payment" with no receipt yet = receipt still needed first
                  const noReceipt = !tx.invoiceId && !tx.invoiceImageUrl;
                  const displayStatus = (tx.status === "Pending Payment" && noReceipt)
                    ? "Pending Receipt"
                    : tx.status;
                  // Only show "Aguarda Reembolso" if transfer hasn't been done yet
                  const awaitingReimbursement = isGuideEtc && tx.status === "Paid" && !tx.transferenciaFeita;
                  const label = awaitingReimbursement ? "Aguarda Reembolso" : displayStatus;
                  const colorClass = awaitingReimbursement
                    ? "bg-yellow-100 text-yellow-700"
                    : STATUS_COLORS[displayStatus] ?? "bg-gray-100 text-gray-500";
                  return (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
                      {label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* IVA breakdown */}
            {(tx.iva6 > 0 || tx.iva13 > 0 || tx.iva23 > 0) && (
              <div className="flex gap-3 text-xs text-gray-400 pt-0.5">
                {tx.iva6 > 0 && <span>IVA 6%: €{tx.iva6.toFixed(2)}</span>}
                {tx.iva13 > 0 && <span>IVA 13%: €{tx.iva13.toFixed(2)}</span>}
                {tx.iva23 > 0 && <span>IVA 23%: €{tx.iva23.toFixed(2)}</span>}
              </div>
            )}

            {/* Finish pending */}
            {(tx.status === "Pending Receipt" || tx.status === "Pending Payment") && !isClosed && (
              <button
                onClick={(e) => { e.stopPropagation(); setPendingToFinish(tx); }}
                className="mt-1 text-xs text-[#667470] font-semibold hover:underline"
              >
                + Adicionar Recibo
              </button>
            )}

            {tx.accountantVerified && (
              <p className="text-xs text-green-600 font-medium">✓ Verificado pelo contabilista</p>
            )}

            {!isClosed && (
              <p className="text-xs text-gray-300 text-right">toque para editar</p>
            )}
          </li>
        ))}
      </ul>

      {pendingToFinish && (
        <AddExpenseModal
          tourId={tourId}
          pendingTransaction={pendingToFinish}
          fornecedores={fornecedores}
          onClose={() => setPendingToFinish(null)}
        />
      )}

      {editing && (
        <EditExpenseModal
          transaction={editing}
          tourId={tourId}
          fornecedores={fornecedores}
          userRole={userRole}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
