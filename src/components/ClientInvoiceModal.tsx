"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { markSaleInvoicedAction } from "@/actions/sales";
import type { FinalisedSale, Transaction } from "@/lib/notion";

export function ClientInvoiceModal({
  sale,
  existingTransaction,
  onClose,
}: {
  sale: FinalisedSale;
  existingTransaction: Transaction | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const defaultBase = sale.pricePerPax > 0 ? sale.pricePerPax * Math.max(sale.numGuests, 1) : 0;
  const [base, setBase] = useState(defaultBase > 0 ? defaultBase.toFixed(2) : "");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const baseNum = parseFloat(base) || 0;
  const iva23Num = Math.round(baseNum * 0.23 * 100) / 100;
  const totalNum = Math.round((baseNum + iva23Num) * 100) / 100;

  async function handleSubmit() {
    if (!existingTransaction) { setError("Não existe transação IN- para este serviço."); return; }
    if (!baseNum) { setError("Introduz o valor base da fatura."); return; }
    setSaving(true);
    setError("");
    try {
      let invoiceImageUrl: string | undefined;
      if (invoiceFile) {
        const fd = new FormData();
        fd.append("file", invoiceFile);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload falhou (${res.status})`);
        }
        invoiceImageUrl = (await res.json()).url;
      }

      const result = await markSaleInvoicedAction(sale.id, existingTransaction.id, {
        date,
        taxFree: baseNum,
        iva23: iva23Num,
        totalAmount: totalNum,
        invoiceImageUrl,
      });

      if (result?.error) throw new Error(result.error);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  }

  const priceLabel = sale.numGuests >= 7 ? "7+" : sale.numGuests >= 4 ? "4-6" : sale.numGuests >= 2 ? "2-3" : "1";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-8 pt-2 space-y-5">
          <h2 className="text-lg font-bold text-gray-900">Emitir Fatura</h2>

          {!existingTransaction && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
              Sem transação IN- associada a este serviço. Cria-a primeiro no Notion.
            </div>
          )}

          {/* Sale summary */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Cliente</span>
              <span className="font-semibold text-gray-900 text-right max-w-[60%]">{sale.clientName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Serviço</span>
              <span className="font-semibold text-gray-900 text-right max-w-[60%]">{sale.serviceName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nº Reserva</span>
              <span className="font-semibold text-gray-900">{sale.saleId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Data</span>
              <span className="font-semibold text-gray-900">{sale.date?.slice(0, 10) ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nº Pax</span>
              <span className="font-semibold text-gray-900">{sale.numGuests || "—"}</span>
            </div>
            {sale.pricePerPax > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Preço/pax ({priceLabel} pax)</span>
                <span className="font-semibold text-gray-900">€{sale.pricePerPax.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Base + IVA breakdown */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Valor Base s/ IVA (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/40"
            />
          </div>

          {baseNum > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">Base s/ IVA</span>
                <span className="font-medium text-gray-800">€{baseNum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">IVA 23%</span>
                <span className="font-medium text-gray-800">€{iva23Num.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-white rounded-b-xl">
                <span className="font-bold text-gray-900">Total da Fatura</span>
                <span className="font-bold text-gray-900">€{totalNum.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Data da Fatura</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#667470]/40"
            />
          </div>

          {/* Invoice upload */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Anexar Fatura (opcional)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
            />
            {invoiceFile ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                <span className="text-xl">{invoiceFile.type === "application/pdf" ? "📄" : "🖼️"}</span>
                <p className="text-sm text-gray-700 flex-1 truncate">{invoiceFile.name}</p>
                <button
                  onClick={() => setInvoiceFile(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#667470]/40 hover:text-[#667470] transition-colors"
              >
                <span>📎</span> Carregar fatura
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving || !baseNum}
            className="w-full bg-[#32373c] hover:bg-[#1a2018] text-white font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 transition-colors active:scale-[0.98]"
          >
            {saving ? "A guardar…" : "Confirmar Faturação"}
          </button>
        </div>
      </div>
    </div>
  );
}
