"use client";

import { useState } from "react";
import type { FinalisedSale, Transaction } from "@/lib/notion";
import { ClientInvoiceModal } from "./ClientInvoiceModal";

function SaleCard({
  sale,
  earningsBySale,
  onClick,
}: {
  sale: FinalisedSale;
  earningsBySale: Record<string, Transaction>;
  onClick: () => void;
}) {
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
      onClick={onClick}
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

      {sale.pricePerPax > 0 && sale.numGuests > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
          <span>{sale.numGuests} × €{sale.pricePerPax.toFixed(2)}/pax ({priceLabel} pax) + IVA 23%</span>
        </div>
      )}

      {existingTotal !== null && (
        <div className={`mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs ${isMatch ? "text-green-600" : "text-orange-500"}`}>
          <span>{isMatch ? "✓ Valor IN- coincide" : "⚠ Valor IN- difere"}</span>
          <span className="font-semibold">€{existingTotal.toFixed(2)} na transação</span>
        </div>
      )}

      <p className="text-xs text-gray-300 text-right mt-1">toque para faturar →</p>
    </li>
  );
}

function saleValue(sale: FinalisedSale, earningsBySale: Record<string, Transaction>): number {
  const existing = earningsBySale[sale.id];
  if (existing) return Math.abs(existing.totalCost);
  return Math.round(sale.pricePerPax * Math.max(sale.numGuests, 1) * 1.23 * 100) / 100;
}

export function FaturasClientesList({
  sales,
  invoicedSales,
  earningsBySale,
}: {
  sales: FinalisedSale[];
  invoicedSales: FinalisedSale[];
  earningsBySale: Record<string, Transaction>;
}) {
  const [selected, setSelected] = useState<FinalisedSale | null>(null);

  const totalisedTotal = sales.reduce((sum, s) => sum + saleValue(s, earningsBySale), 0);
  const invoicedTotal  = invoicedSales.reduce((sum, s) => sum + saleValue(s, earningsBySale), 0);

  return (
    <>
      <div className="flex gap-3 mb-6">
        {sales.length > 0 && (
          <div className="flex-1 bg-white/20 rounded-2xl p-4">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Por faturar</p>
            <p className="text-2xl font-bold text-white">€{totalisedTotal.toFixed(2)}</p>
            <p className="text-xs text-white/50 mt-0.5">{sales.length} serviço{sales.length !== 1 ? "s" : ""} Finalised</p>
          </div>
        )}
        {invoicedSales.length > 0 && (
          <div className="flex-1 bg-white/10 rounded-2xl p-4">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Faturado</p>
            <p className="text-2xl font-bold text-white/70">€{invoicedTotal.toFixed(2)}</p>
            <p className="text-xs text-white/40 mt-0.5">{invoicedSales.length} serviço{invoicedSales.length !== 1 ? "s" : ""} Invoiced</p>
          </div>
        )}
      </div>

      {sales.length > 0 && (
        <ul className="space-y-3">
          {sales.map((sale) => (
            <SaleCard
              key={sale.id}
              sale={sale}
              earningsBySale={earningsBySale}
              onClick={() => setSelected(sale)}
            />
          ))}
        </ul>
      )}

      {invoicedSales.length > 0 && (
        <div className={sales.length > 0 ? "mt-8" : ""}>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
            Faturado
          </p>
          <ul className="space-y-3">
            {invoicedSales.map((sale) => {
              const existing = earningsBySale[sale.id];
              const existingTotal = existing ? Math.abs(existing.totalCost) : null;
              const base = sale.pricePerPax * Math.max(sale.numGuests, 1);
              const estimatedTotal = Math.round(base * 1.23 * 100) / 100;
              const priceLabel = sale.numGuests >= 7 ? "7-"
                               : sale.numGuests >= 4 ? "4-6"
                               : sale.numGuests >= 2 ? "2-3"
                               : "1";

              return (
                <li
                  key={sale.id}
                  className="bg-white/80 rounded-2xl border border-gray-100 shadow-sm p-4 opacity-75"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {sale.clientName || sale.saleId}
                        </p>
                        <span className="shrink-0 text-[10px] font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                          Faturado
                        </span>
                      </div>
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

                  {sale.pricePerPax > 0 && sale.numGuests > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                      <span>{sale.numGuests} × €{sale.pricePerPax.toFixed(2)}/pax ({priceLabel} pax) + IVA 23%</span>
                    </div>
                  )}

                  {existing?.invoiceId && (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span>Fatura</span>
                      <span className="font-semibold">{existing.invoiceId}</span>
                    </div>
                  )}

                  {existingTotal !== null && (
                    <div className="mt-1 flex items-center justify-between text-xs text-green-600">
                      <span>✓ Valor faturado</span>
                      <span className="font-semibold">€{existingTotal.toFixed(2)}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
