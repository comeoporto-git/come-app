"use client";

import { useState } from "react";
import type { FinalisedSale, Transaction } from "@/lib/notion";
import { ClientInvoiceModal } from "./ClientInvoiceModal";

export function FaturasClientesList({
  sales,
  earningsBySale,
}: {
  sales: FinalisedSale[];
  earningsBySale: Record<string, Transaction>;
}) {
  const [selected, setSelected] = useState<FinalisedSale | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {sales.map((sale) => {
          const priceLabel = sale.numGuests >= 7 ? "7-"
                           : sale.numGuests >= 4 ? "4-6"
                           : sale.numGuests >= 2 ? "2-3"
                           : "1";
          const base = sale.pricePerPax * Math.max(sale.numGuests, 1);
          const estimatedTotal = Math.round(base * 1.23 * 100) / 100;
          const existing = earningsBySale[sale.id];
          const existingTotal = existing ? Math.abs(existing.totalCost) : null;
          const isMatch = existingTotal !== null && Math.abs(existingTotal - estimatedTotal) < 0.02;

          return (
            <li
              key={sale.id}
              onClick={() => setSelected(sale)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:border-[#667470]/30 active:scale-[0.99] transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {sale.clientName || sale.saleId}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{sale.serviceName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sale.date?.slice(0, 10) ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400 font-mono">{sale.saleId}</p>
                  {sale.numGuests > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">{sale.numGuests} pax</p>
                  )}
                  {estimatedTotal > 0 && (
                    <p className="text-sm font-semibold text-[#32373c] mt-0.5">
                      €{estimatedTotal.toFixed(2)} c/ IVA
                    </p>
                  )}
                </div>
              </div>

              {/* Price breakdown */}
              {sale.pricePerPax > 0 && sale.numGuests > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                  <span>{sale.numGuests} × €{sale.pricePerPax.toFixed(2)}/pax ({priceLabel} pax) + IVA 23%</span>
                </div>
              )}

              {/* IN- transaction reconciliation */}
              {existingTotal !== null && (
                <div className={`mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs ${isMatch ? "text-green-600" : "text-orange-500"}`}>
                  <span>{isMatch ? "✓ Valor IN- coincide" : "⚠ Valor IN- difere"}</span>
                  <span className="font-semibold">€{existingTotal.toFixed(2)} na transação</span>
                </div>
              )}

              <p className="text-xs text-gray-300 text-right mt-1">toque para faturar →</p>
            </li>
          );
        })}
      </ul>

      {selected && (
        <ClientInvoiceModal
          sale={selected}
          existingTransaction={earningsBySale[selected.id] ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
