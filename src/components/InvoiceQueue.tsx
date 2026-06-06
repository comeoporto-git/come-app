"use client";

import { useState, useTransition } from "react";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { InvoiceCollectionModal } from "@/components/InvoiceCollectionModal";
import { retryAiScanAction } from "@/actions/transactions";

type Tab = "pending" | "done" | "failed";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  });
}

export function InvoiceQueue({
  needingInvoice,
  treated,
  aiScanFailed,
  fornecedores,
}: {
  needingInvoice: Transaction[];
  treated: Transaction[];
  aiScanFailed: Transaction[];
  fornecedores: Fornecedor[];
}) {
  const [tab, setTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function handleRetry(t: Transaction) {
    setRetrying(t.id);
    setRetryMsg((prev: Record<string, string>) => ({ ...prev, [t.id]: "" }));
    startTransition(async () => {
      const res = await retryAiScanAction(t.id);
      setRetrying(null);
      setRetryMsg((prev: Record<string, string>) => ({
        ...prev,
        [t.id]: res.success ? "✓ Scan OK! A mover para Por Tratar…" : (res.error ?? "Erro desconhecido"),
      }));
    });
  }

  const list = tab === "pending" ? needingInvoice : tab === "done" ? treated : aiScanFailed;
  const isClickable = tab !== "done";

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("pending")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "pending"
              ? "bg-white text-[#32373c] shadow-sm"
              : "bg-white/20 text-white/70 hover:bg-white/30"
          }`}
        >
          Por Tratar
          {needingInvoice.length > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${
              tab === "pending" ? "bg-red-100 text-red-600" : "bg-red-500/70 text-white"
            }`}>
              {needingInvoice.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("done")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "done"
              ? "bg-white text-[#32373c] shadow-sm"
              : "bg-white/20 text-white/70 hover:bg-white/30"
          }`}
        >
          Tratadas{treated.length > 0 ? ` · ${treated.length}` : ""}
        </button>
        <button
          onClick={() => setTab("failed")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "failed"
              ? "bg-white text-[#32373c] shadow-sm"
              : "bg-white/20 text-white/70 hover:bg-white/30"
          }`}
        >
          Scan Falhou
          {aiScanFailed.length > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${
              tab === "failed" ? "bg-amber-100 text-amber-700" : "bg-amber-500/70 text-white"
            }`}>
              {aiScanFailed.length}
            </span>
          )}
        </button>
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="text-center py-16">
          {tab === "pending" ? (
            <>
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-white font-semibold">Tudo tratado!</p>
              <p className="text-white/50 text-sm mt-1">Sem faturas em falta.</p>
            </>
          ) : tab === "failed" ? (
            <>
              <div className="text-5xl mb-3">✅</div>
              <p className="text-white/50 text-sm">Sem scans falhados.</p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-3">📂</div>
              <p className="text-white/50 text-sm">Sem faturas tratadas ainda.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((t) => (
            <li key={t.id} className="flex flex-col gap-1">
              <button
                onClick={() => isClickable && setSelected(t)}
                className={`w-full text-left rounded-2xl p-4 border shadow-sm transition-all ${
                  isClickable
                    ? "bg-white border-gray-100 hover:shadow-md active:scale-[0.98] cursor-pointer"
                    : "bg-white/70 border-white/20 cursor-default"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-semibold text-sm text-[#32373c] truncate">
                      {t.supplier || "—"}
                    </p>
                    {t.tourName && (
                      <p className="text-xs text-gray-500 truncate">
                        🗓 {t.tourName}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
                    <p className="text-xs text-gray-500">{t.paymentMethod}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <p className="text-sm font-bold text-[#32373c]">
                      €{t.totalCost.toFixed(2)}
                    </p>
                    {tab === "done" ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        ✓ Tratada
                      </span>
                    ) : tab === "failed" ? (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        Scan falhou
                      </span>
                    ) : (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                        Em falta
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {tab === "failed" && (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleRetry(t)}
                    disabled={retrying === t.id}
                    className="w-full py-2 rounded-xl text-sm font-semibold bg-white/20 text-white hover:bg-white/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {retrying === t.id ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        A fazer scan…
                      </>
                    ) : (
                      <>✨ Re-scan com AI</>
                    )}
                  </button>
                  {retryMsg[t.id] && (
                    <p className={`text-xs text-center px-2 ${retryMsg[t.id].startsWith("✓") ? "text-green-300" : "text-red-300"}`}>
                      {retryMsg[t.id]}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Modal */}
      {selected && (
        <InvoiceCollectionModal
          transaction={selected}
          fornecedores={fornecedores}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
