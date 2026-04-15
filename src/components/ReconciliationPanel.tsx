"use client";

import { useState, useTransition } from "react";
import { dismissUnmatchedAction, clearFlagAction } from "@/actions/banking";
import type { Transaction } from "@/lib/notion";

export function ReconciliationPanel({
  unmatched: initialUnmatched,
  flagged: initialFlagged,
}: {
  unmatched: Transaction[];
  flagged: Transaction[];
}) {
  const [unmatched, setUnmatched] = useState(initialUnmatched);
  const [flagged, setFlagged] = useState(initialFlagged);
  const [tab, setTab] = useState<"unmatched" | "flagged">("unmatched");

  function removeUnmatched(id: string) {
    setUnmatched((prev) => prev.filter((t) => t.id !== id));
  }
  function removeFlagged(id: string) {
    setFlagged((prev) => prev.filter((t) => t.id !== id));
  }

  const tabs = [
    { id: "unmatched" as const, label: "Débitos sem Fatura", count: unmatched.length },
    { id: "flagged" as const, label: "Faturas sem Débito", count: flagged.length },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              tab === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.id ? "bg-red-100 text-red-600" : "bg-gray-200 text-gray-500"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Unmatched bank entries */}
      {tab === "unmatched" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 px-1">
            O banco debitou estes valores mas não existe fatura correspondente na app.
            Podes dispensar se não for uma despesa da empresa.
          </p>

          {unmatched.length === 0 ? (
            <EmptyState icon="✅" message="Nenhum débito por identificar" />
          ) : (
            unmatched.map((t) => (
              <UnmatchedCard
                key={t.id}
                transaction={t}
                onDismiss={() => removeUnmatched(t.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Flagged invoices */}
      {tab === "flagged" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 px-1">
            Faturas com Cartão COME sem débito bancário após 3 dias, ou despesas
            Pelo Guia sem transferência de reembolso após 7 dias. Marca como OK
            se o banco processou de forma diferente.
          </p>

          {flagged.length === 0 ? (
            <EmptyState icon="✅" message="Nenhuma fatura em falta" />
          ) : (
            flagged.map((t) => (
              <FlaggedCard
                key={t.id}
                transaction={t}
                onClear={() => removeFlagged(t.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Unmatched card ────────────────────────────────────────────────────────────

function UnmatchedCard({
  transaction: t,
  onDismiss,
}: {
  transaction: Transaction;
  onDismiss: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDismiss() {
    startTransition(async () => {
      await dismissUnmatchedAction(t.id);
      onDismiss();
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
          <span className="text-base">🏦</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{t.supplier}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {t.date ?? "—"} · Ref: {t.bankReference || "—"}
          </p>
        </div>
        <p className="text-sm font-bold text-gray-900 flex-shrink-0">
          €{t.totalCost.toFixed(2)}
        </p>
      </div>

      <div className="px-4 pb-3 flex items-center gap-2">
        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium flex-1">
          Débito sem fatura
        </span>

        {confirming ? (
          <>
            <button
              onClick={handleDismiss}
              disabled={isPending}
              className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 px-2 py-1"
            >
              {isPending ? "A remover…" : "Confirmar"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          >
            Dispensar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Flagged card ──────────────────────────────────────────────────────────────

function FlaggedCard({
  transaction: t,
  onClear,
}: {
  transaction: Transaction;
  onClear: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClear() {
    startTransition(async () => {
      await clearFlagAction(t.id);
      onClear();
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0">
          <span className="text-base">⚠️</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{t.supplier}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {t.date ?? "—"}
            {t.tourName ? ` · ${t.tourName}` : ""}
          </p>
          {t.invoiceId && (
            <p className="text-xs text-gray-400">Fatura: {t.invoiceId}</p>
          )}
        </div>
        <p className="text-sm font-bold text-gray-900 flex-shrink-0">
          €{t.totalCost.toFixed(2)}
        </p>
      </div>

      <div className="px-4 pb-3 flex items-center gap-2">
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium flex-1">
          {t.status === "Flag: Missing Reimbursement"
            ? "Reembolso ao guia não encontrado"
            : "Débito bancário não encontrado"}
        </span>
        <button
          onClick={handleClear}
          disabled={isPending}
          className="text-xs font-semibold text-[#667470] hover:text-[#32373c] transition-colors disabled:opacity-50 px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          {isPending ? "A processar…" : "Marcar como OK"}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
