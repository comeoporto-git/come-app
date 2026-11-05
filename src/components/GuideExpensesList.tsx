"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { Transaction, Fornecedor } from "@/lib/notion";
import { uploadComprovantivoAction, markTransferenciaFeitaAction } from "@/actions/transactions";
import { analyzeComprovativo } from "@/actions/invoice";
import { useRouter } from "next/navigation";
import { EditExpenseModal } from "./EditExpenseModal";
import { buildBankTransferCsv, encodeWindows1252, normalizeIban, type BankTransferLine } from "@/lib/bankTransferFile";

type Selection = { selected: boolean; onToggle: () => void } | null;

function GuideExpenseRow({
  expense,
  fornecedores,
  selection = null,
}: {
  expense: Transaction;
  fornecedores: Fornecedor[];
  selection?: Selection;
}) {
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

      let transferDate: string | undefined;
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
        const scanned = await analyzeComprovativo(base64, mediaType);
        if (scanned.transferDate) transferDate = scanned.transferDate;
      } catch (err) {
        console.error("[GuideExpensesList] comprovativo date scan failed:", err);
      }

      await uploadComprovantivoAction(expense.id, url, transferDate);
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
    <li className={`px-5 py-4 space-y-3 ${selection?.selected ? "bg-emerald-50/60" : ""}`}>
      {/* Top row: supplier + amount */}
      <div className="flex items-start gap-3">
      {selection && (
        <input
          type="checkbox"
          checked={selection.selected}
          onChange={selection.onToggle}
          className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
          title="Incluir no ficheiro de transferências"
        />
      )}
      <div
        className="flex-1 min-w-0 flex items-start justify-between gap-3 cursor-pointer hover:opacity-70 transition-opacity"
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

function payeeKey(expense: Transaction) {
  return expense.paidByName || expense.supplier;
}

/** Uma linha por beneficiário/IBAN, com o total das despesas selecionadas. */
function toBankLines(selected: Transaction[]): BankTransferLine[] {
  const groups = new Map<string, Transaction[]>();
  for (const e of selected) {
    const key = `${payeeKey(e)}|${normalizeIban(e.payeeIban ?? "")}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.values()].map((items) => {
    const first = items[0];
    const allSupplierPayments = items.every((e) => e.status === "Pending Payment");
    const info =
      items.length === 1 && first.invoiceId
        ? `Fatura ${first.invoiceId}`
        : `COME ${items.length} despesa${items.length === 1 ? "" : "s"}`;
    return {
      beneficiary: payeeKey(first),
      iban: first.payeeIban ?? "",
      type: allSupplierPayments ? "Fornecedores" : "Transferência",
      info,
      amount: Math.round(items.reduce((sum, e) => sum + Math.abs(e.totalCost), 0) * 100) / 100,
    };
  });
}

function downloadBankFile(lines: BankTransferLine[]) {
  const bytes = encodeWindows1252(buildBankTransferCsv(lines));
  const blob = new Blob([bytes], { type: "text/csv;charset=windows-1252" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transferencias-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function GuideExpensesList({ expenses, fornecedores = [] }: { expenses: Transaction[]; fornecedores?: Fornecedor[] }) {
  const [payeeFilter, setPayeeFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const payeeCounts = expenses.reduce((acc, expense) => {
    const key = payeeKey(expense);
    if (key) acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const payeeOptions = Object.keys(payeeCounts).sort((a, b) => a.localeCompare(b, "pt"));
  // Ignore a stale filter (e.g. the last expense for that payee was just marked as transferred)
  const activeFilter = payeeFilter && payeeCounts[payeeFilter] ? payeeFilter : "";

  const visible = activeFilter ? expenses.filter((e) => payeeKey(e) === activeFilter) : expenses;
  const ready = visible.filter((e) => !!(e.invoiceId || e.invoiceImageUrl));
  const waitingForInvoice = visible.filter((e) => !(e.invoiceId || e.invoiceImageUrl));

  const supplierTotals = ready.reduce((acc, expense) => {
    const key = payeeKey(expense);
    if (!acc[key]) acc[key] = { total: 0, iban: expense.payeeIban ?? "" };
    acc[key].total += Math.abs(expense.totalCost);
    if (!acc[key].iban && expense.payeeIban) acc[key].iban = expense.payeeIban;
    return acc;
  }, {} as Record<string, { total: number; iban: string }>);

  const sortedSuppliers = Object.entries(supplierTotals).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = sortedSuppliers.reduce((sum, [, v]) => sum + v.total, 0);

  // Seleção para o ficheiro do banco: só despesas prontas e com IBAN.
  const canSelect = (e: Transaction) => !!(e.invoiceId || e.invoiceImageUrl) && !!e.payeeIban?.trim();
  // Ignora ids que já não estão na lista (p.ex. marcadas como transferidas entretanto)
  const selectedExpenses = expenses.filter((e) => selectedIds.has(e.id) && canSelect(e));
  const selectedTotal = selectedExpenses.reduce((sum, e) => sum + Math.abs(e.totalCost), 0);
  const selectableVisible = ready.filter(canSelect);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((e) => selectedIds.has(e.id));

  function setSelected(ids: string[], on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function selectionFor(expense: Transaction): Selection {
    if (!canSelect(expense)) return null;
    const selected = selectedIds.has(expense.id);
    return { selected, onToggle: () => setSelected([expense.id], !selected) };
  }

  return (
    <div>
      {payeeOptions.length > 1 && (
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <label htmlFor="payee-filter" className="text-xs font-medium text-gray-500 shrink-0">
            Pessoa / Fornecedor
          </label>
          <select
            id="payee-filter"
            value={activeFilter}
            onChange={(e) => setPayeeFilter(e.target.value)}
            className="flex-1 min-w-0 text-xs text-[#32373c] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#667470]"
          >
            <option value="">Todos ({expenses.length})</option>
            {payeeOptions.map((name) => (
              <option key={name} value={name}>
                {name} ({payeeCounts[name]})
              </option>
            ))}
          </select>
          {activeFilter && (
            <button
              onClick={() => setPayeeFilter("")}
              className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0"
            >
              Limpar
            </button>
          )}
        </div>
      )}
      {ready.length > 0 && (
        <div>
          <div className="px-5 py-2 bg-green-50 border-b border-green-100">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-green-700">✓ Prontas a transferir ({ready.length})</p>
              {selectableVisible.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs font-medium text-green-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => setSelected(selectableVisible.map((e) => e.id), !allVisibleSelected)}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                  Selecionar todas
                </label>
              )}
            </div>
          </div>
          {sortedSuppliers.length > 0 && (
            <div className="px-5 py-3 bg-green-50/50 border-b border-green-100 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Total por pessoa / fornecedor</p>
              {sortedSuppliers.map(([supplier, { total, iban }]) => {
                const payeeSelectable = selectableVisible.filter((e) => payeeKey(e) === supplier);
                const payeeAllSelected = payeeSelectable.length > 0 && payeeSelectable.every((e) => selectedIds.has(e.id));
                return (
                <div key={supplier} className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                  {payeeSelectable.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={payeeAllSelected}
                      onChange={() => setSelected(payeeSelectable.map((e) => e.id), !payeeAllSelected)}
                      className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
                      title={`Selecionar todas as despesas de ${supplier}`}
                    />
                  ) : (
                    <span className="w-4 shrink-0" title="Sem IBAN — não pode ir no ficheiro" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <button
                      onClick={() => setPayeeFilter(activeFilter === supplier ? "" : supplier)}
                      className="text-left text-xs font-medium text-[#32373c] hover:text-[#667470] hover:underline"
                      title={activeFilter === supplier ? "Mostrar todos" : `Filtrar por ${supplier}`}
                    >
                      {supplier}
                    </button>
                    {iban ? <IbanCopy iban={iban} /> : <span className="text-[11px] text-orange-600">Sem IBAN</span>}
                  </div>
                  </div>
                  <span className="text-xs font-bold text-red-600 shrink-0">€{total.toFixed(2)}</span>
                </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-green-200">
                <span className="text-xs font-bold text-[#32373c]">Total</span>
                <span className="text-xs font-bold text-red-700">€{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
          <ul className="divide-y divide-gray-50">
            {ready.map((expense) => (
              <GuideExpenseRow key={expense.id} expense={expense} fornecedores={fornecedores} selection={selectionFor(expense)} />
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
      {selectedExpenses.length > 0 && (
        <BankFileBar
          expenses={selectedExpenses}
          total={selectedTotal}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}

function BankFileBar({ expenses, total, onClear }: { expenses: Transaction[]; total: number; onClear: () => void }) {
  const lines = toBankLines(expenses);
  return (
    <div className="sticky bottom-0 z-10 px-5 py-3 bg-white border-t border-emerald-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] flex items-center gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#32373c]">
          {lines.length} transferência{lines.length === 1 ? "" : "s"} · €{total.toFixed(2)}
        </p>
        <p className="text-[11px] text-gray-400">
          {expenses.length} despesa{expenses.length === 1 ? "" : "s"} · uma transferência por pessoa / fornecedor
        </p>
      </div>
      <button onClick={onClear} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
        Limpar
      </button>
      <button
        onClick={() => downloadBankFile(lines)}
        className="text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 px-3 py-2 rounded-lg transition-colors"
        title="CSV no formato do CA Empresas → Transferências → Ficheiro"
      >
        ⬇ Gerar ficheiro para o banco
      </button>
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
