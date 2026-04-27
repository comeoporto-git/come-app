"use client";

import { useState } from "react";
import type { FinalisedSale } from "@/lib/notion";
import { ClientInvoiceModal } from "./ClientInvoiceModal";

export function FaturasClientesList({ sales }: { sales: FinalisedSale[] }) {
  const [selected, setSelected] = useState<FinalisedSale | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {sales.map((sale) => {
          const priceLabel = sale.numGuests >= 7 ? "7+"
                           : sale.numGuests >= 4 ? "4-6"
                           : sale.numGuests >= 2 ? "2-3"
                           : "1";
          const estimatedTotal = sale.pricePerPax * Math.max(sale.numGuests, 1);

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
                  <p className="text-xs text-gray-400 mt-0.5">{sale.date ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400 font-mono">{sale.saleId}</p>
                  {sale.numGuests > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">{sale.numGuests} pax</p>
                  )}
                  {estimatedTotal > 0 && (
                    <p className="text-sm font-semibold text-[#32373c] mt-0.5">
                      ~€{estimatedTotal.toFixed(0)}
                    </p>
                  )}
                </div>
              </div>

              {/* Price breakdown */}
              {sale.pricePerPax > 0 && sale.numGuests > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                  <span>{sale.numGuests} × €{sale.pricePerPax.toFixed(2)}/pax ({priceLabel} pax)</span>
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
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
