"use client";

import { useState } from "react";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { InvoiceCollectionModal } from "@/components/InvoiceCollectionModal";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  });
}

export function AiScanFailedSection({
  transactions,
  fornecedores,
}: {
  transactions: Transaction[];
  fornecedores: Fornecedor[];
}) {
  const [selected, setSelected] = useState<Transaction | null>(null);

  if (transactions.length === 0) return null;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
        <div className="p-5 flex items-center gap-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-2xl shrink-0">⚠️</div>
          <div className="flex-1">
            <p className="font-bold text-[#32373c]">Scan IA Falhou</p>
            <p className="text-sm text-gray-400">Foto guardada · campos por preencher</p>
          </div>
          <span className="text-xs bg-amber-500 text-white font-bold px-2.5 py-1 rounded-full shrink-0">
            {transactions.length}
          </span>
        </div>
        <ul className="divide-y divide-gray-50">
          {transactions.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setSelected(t)}
                className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#32373c] truncate">{t.supplier || "—"}</p>
                  {t.tourName && <p className="text-xs text-gray-500 truncate">🗓 {t.tourName}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(t.date)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.invoiceImageUrl && (
                    <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-medium">Foto</span>
                  )}
                  <span className="text-gray-300 text-lg">→</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

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
