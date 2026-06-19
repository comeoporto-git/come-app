"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { uploadComprovantivoAction, markTransferenciaFeitaAction } from "@/actions/transactions";
import { useRouter } from "next/navigation";
import { EditExpenseModal } from "./EditExpenseModal";

function GuideExpenseRow({ expense, fornecedores }: { expense: Transaction; fornecedores: Fornecedor[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [localComprovantivoUrl, setLocalComprovantivoUrl] = useState(expense.comprovantivoUrl);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const hasComprovativo = !!localComprovantivoUrl;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      await uploadComprovantivoAction(expense.id, url);
      setLocalComprovantivoUrl(url);
      router.refresh();
    } catch {
      setError("Erro ao carregar ficheiro. Tenta novamente.");
    } finally {
      setUploading(false);
    }
  }

  async function handleMarkTransferencia() {
    if (!hasComprovativo) return;
    setMarking(true);
    setError("");
    try {
      await markTransferenciaFeitaAction(expense.id);
      router.refresh();
    } catch {
      setError("Erro ao marcar transferência. Tenta novamente.");
    } finally {
      setMarking(false);
    }
  }

  const dateStr = expense.date
    ? new Date(expense.date).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const isPendingPayment = expense.status === "Pending Payment";

  return (
    <>
    {editOpen && (
      <EditExpenseModal
        transaction={expense}
        tourId={expense.tourId ?? ""}
        fornecedores={fornecedores}
        userRole="Admin"
        onClose={() => { setEditOpen(false); router.refresh(); }}
      />
    )}
    <li className="px-5 py-4 space-y-3">
      {/* Top row: supplier + amount */}
      <div
        className="flex items-start justify-between gap-3 cursor-pointer hover:opacity-70 transition-opacity"
        onClick={() => setEditOpen(true)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#32373c] truncate">{expense.supplier}</p>
            {isPendingPayment && (
              <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full shrink-0">A pagar</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
          {expense.paidByName && !isPendingPayment && (
            <p className="text-xs font-medium text-[#667470] mt-0.5">Pago por: {expense.paidByName}</p>
          )}
          {expense.payeeIban && (
            <IbanCopy iban={expense.payeeIban} />
          )}
          {expense.tourName && expense.tourId && (
            <p className="text-xs text-gray-400">
              Serviço:{" "}
              <Link
                href={`/guide/tours/${expense.tourId}`}
                className="text-[#667470] font-medium hover:underline"
              >
                {expense.tourName}
              </Link>
            </p>
          )}
          {expense.invoiceId && (
            <p className="text-xs text-gray-400">Fatura: {expense.invoiceId}</p>
          )}
        </div>
        <p className="text-sm font-bold text-red-600 shrink-0">
          €{Math.abs(expense.totalCost).toFixed(2)}
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Actions row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Comprovativo upload / view */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleUpload}
        />
        {localComprovantivoUrl ? (
          <a
            href={localComprovantivoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-100 transition-colors"
          >
            📄 Ver Comprovativo
          </a>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-[#667470] border border-dashed border-[#667470]/40 bg-[#667470]/5 px-3 py-1.5 rounded-lg font-medium hover:bg-[#667470]/10 transition-colors disabled:opacity-50"
          >
            {uploading ? "A carregar…" : "📎 Carregar Comprovativo"}
          </button>
        )}

        {/* Replace comprovativo if already uploaded */}
        {localComprovantivoUrl && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
          >
            {uploading ? "A carregar…" : "Substituir"}
          </button>
        )}

        {/* Transferência Feita checkbox */}
        <label
          className={`ml-auto flex items-center gap-2 cursor-pointer select-none ${
            !hasComprovativo ? "opacity-40 cursor-not-allowed" : ""
          }`}
          title={!hasComprovativo ? "Carrega o comprovativo antes de marcar" : ""}
        >
          <div
            onClick={hasComprovativo && !marking ? handleMarkTransferencia : undefined}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
              hasComprovativo
                ? "border-emerald-500 hover:bg-emerald-50 cursor-pointer"
                : "border-gray-300 cursor-not-allowed"
            }`}
          >
            {marking && (
              <span className="text-[10px] text-emerald-600">…</span>
            )}
          </div>
          <span className="text-xs font-medium text-gray-600">Transferência Feita</span>
        </label>
      </div>
    </li>
    </>
  );
}

export function GuideExpensesList({ expenses, fornecedores = [] }: { expenses: Transaction[]; fornecedores?: Fornecedor[] }) {
  const ready = expenses.filter((e) => !!(e.invoiceId || e.invoiceImageUrl));
  const waitingForInvoice = expenses.filter((e) => !(e.invoiceId || e.invoiceImageUrl));

  const supplierTotals = ready.reduce((acc, expense) => {
    const key = expense.paidByName || expense.supplier;
    acc[key] = (acc[key] || 0) + Math.abs(expense.totalCost);
    return acc;
  }, {} as Record<string, number>);

  const sortedSuppliers = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {ready.length > 0 && (
        <div>
          <div className="px-5 py-2 bg-green-50 border-b border-green-100">
            <p className="text-xs font-semibold text-green-700">✓ Prontas a transferir ({ready.length})</p>
          </div>
          {sortedSuppliers.length > 0 && (
            <div className="px-5 py-3 bg-green-50/50 border-b border-green-100 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Total por pessoa / fornecedor</p>
              {sortedSuppliers.map(([supplier, total]) => (
                <div key={supplier} className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#32373c]">{supplier}</span>
                  <span className="text-xs font-bold text-red-600">€{total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <ul className="divide-y divide-gray-50">
            {ready.map((expense) => (
              <GuideExpenseRow key={expense.id} expense={expense} fornecedores={fornecedores} />
            ))}
          </ul>
        </div>
      )}
      {waitingForInvoice.length > 0 && (
        <div>
          <div className="px-5 py-2 bg-orange-50 border-b border-orange-100 border-t border-t-gray-100">
            <p className="text-xs font-semibold text-orange-600">⏳ Aguardam Fatura ({waitingForInvoice.length})</p>
          </div>
          <ul className="divide-y divide-gray-50 opacity-60">
            {waitingForInvoice.map((expense) => (
              <GuideExpenseRow key={expense.id} expense={expense} fornecedores={fornecedores} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IbanCopy({ iban }: { iban: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(iban);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500 font-mono hover:text-[#667470] active:scale-95 transition-all"
      title="Toque para copiar IBAN"
    >
      <span>{iban}</span>
      <span className="text-[10px] font-sans font-medium text-gray-400">
        {copied ? "✓ copiado" : "copiar"}
      </span>
    </button>
  );
}
