"use client";

import { useState } from "react";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { AddExpenseModal } from "./AddExpenseModal";
import { EditExpenseModal } from "./EditExpenseModal";
import type { ServicePerson } from "./WhoPaidPicker";
import { partnerPaymentByWhoPaid } from "@/lib/constants";
import { convertExpenseToHonorarioAction } from "@/actions/transactions";
import { useRouter } from "next/navigation";

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
  logisticsName,
  decoradorName,
  memberNames = {},
  extraTeam = [],
  roster = [],
  userRole = "Guide",
}: {
  transactions: Transaction[];
  tourId: string;
  isClosed: boolean;
  fornecedores?: Fornecedor[];
  guideName?: string;
  chefName?: string;
  driverName?: string;
  logisticsName?: string;
  decoradorName?: string;
  /** Team member id → name, to show who actually paid when a service has several people per role. */
  memberNames?: Record<string, string>;
  /** Extra people on the service beyond the primary slots, with a display role. */
  extraTeam?: { name: string; role: string }[];
  /** Everyone on the service by role, for the Admin "Quem pagou?" picker when editing. */
  roster?: ServicePerson[];
  userRole?: string;
}) {
  const [pendingToFinish, setPendingToFinish] = useState<Transaction | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [converting, setConverting] = useState<Transaction | null>(null);
  const isAdmin = userRole === "Admin";

  const payerName = (tx: Transaction): string | undefined => {
    const isTeamPaid = tx.whoPaid === "Guide" || tx.whoPaid === "Chef" || tx.whoPaid === "Driver" || tx.whoPaid === "Logistics" || tx.whoPaid === "Decorador";
    // The person who logged it, if known — the role slot can't tell two chefs apart.
    if (isTeamPaid && tx.paidByTeamId && memberNames[tx.paidByTeamId]) return memberNames[tx.paidByTeamId];
    return tx.whoPaid === "Guide" ? guideName
      : tx.whoPaid === "Chef" ? chefName
      : tx.whoPaid === "Driver" ? driverName
      : tx.whoPaid === "Logistics" ? logisticsName
      : tx.whoPaid === "Decorador" ? decoradorName
      : partnerPaymentByWhoPaid(tx.whoPaid)?.name;
  };

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
                {payerName(tx) && (
                  <p className="text-xs font-medium text-[#667470]">Pago por: {payerName(tx)}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">€{Math.abs(tx.totalCost).toFixed(2)}</p>
                {(() => {
                  const isGuideEtc = tx.whoPaid === "Guide" || tx.whoPaid === "Chef" || tx.whoPaid === "Driver" || tx.whoPaid === "Logistics" || tx.whoPaid === "Decorador" || !!partnerPaymentByWhoPaid(tx.whoPaid);
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

            {isAdmin && tx.paymentMethod !== "Honorários" && (
              <button
                onClick={(e) => { e.stopPropagation(); setConverting(tx); }}
                className="mt-1 block text-xs text-[#667470] font-semibold hover:underline"
              >
                ⇄ Converter em Honorário
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

      {converting && (
        <ConvertToHonorarioModal
          transaction={converting}
          tourId={tourId}
          defaultMember={payerName(converting)}
          team={[
            guideName ? { name: guideName, role: "Guia" } : null,
            chefName ? { name: chefName, role: "Chef" } : null,
            driverName ? { name: driverName, role: "Motorista" } : null,
            logisticsName ? { name: logisticsName, role: "Logistics" } : null,
            decoradorName ? { name: decoradorName, role: "Decorador" } : null,
            ...extraTeam,
          ].filter(Boolean) as { name: string; role: string }[]}
          onClose={() => setConverting(null)}
        />
      )}

      {editing && (
        <EditExpenseModal
          transaction={editing}
          tourId={tourId}
          fornecedores={fornecedores}
          userRole={userRole}
          roster={roster}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ConvertToHonorarioModal({
  transaction,
  tourId,
  defaultMember,
  team,
  onClose,
}: {
  transaction: Transaction;
  tourId: string;
  defaultMember?: string;
  team: { name: string; role: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  // Payer first (the member who uploaded the receipt), then the rest of the team
  const options = [
    ...(defaultMember && !team.some((m) => m.name === defaultMember)
      ? [{ name: defaultMember, role: "Pagou a despesa" }]
      : []),
    ...team,
  ].filter((m, i, arr) => arr.findIndex((o) => o.name === m.name) === i);
  const [member, setMember] = useState(defaultMember ?? options[0]?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setSaving(true);
    setError("");
    const result = await convertExpenseToHonorarioAction(transaction.id, tourId, member);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-semibold text-[#32373c]">Converter em Honorário</h3>
          <p className="text-xs text-gray-500 mt-1">
            {transaction.supplier} · €{Math.abs(transaction.totalCost).toFixed(2)}
          </p>
        </div>

        {options.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">Nenhum membro atribuído a este serviço.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Honorários de:</p>
            {options.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => setMember(m.name)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-colors ${
                  member === m.name ? "border-[#667470] bg-[#667470]/5" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <span className="text-sm font-semibold text-[#32373c]">{m.name}</span>
                <span className="text-xs text-gray-500">{m.role}</span>
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400">
          O fornecedor passa a ser o membro da equipa e o pagamento fica a cargo da COME (Honorários).
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !member}
            className="flex-1 py-2.5 rounded-xl bg-[#32373c] text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "A converter…" : "Converter"}
          </button>
        </div>
      </div>
    </div>
  );
}
