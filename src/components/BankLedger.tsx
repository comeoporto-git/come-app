"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { linkBankTransactionAction, dismissUnmatchedAction } from "@/actions/banking";
import type { StoredTransaction } from "@/lib/enablebanking";
import type { Transaction } from "@/lib/notion";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function fmtEur(n: number) {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

type Filter = "all" | "matched" | "unmatched";

// ── Inline expense picker ─────────────────────────────────────────────────────

function ExpensePicker({
  bankTxn,
  placeholderId,
  linkable,
  onDone,
}: {
  bankTxn: StoredTransaction;
  placeholderId?: string;
  linkable: Transaction[];
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [linked, setLinked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return linkable.filter((e) =>
      !q ||
      e.supplier.toLowerCase().includes(q) ||
      e.invoiceId.toLowerCase().includes(q) ||
      (e.tourName ?? "").toLowerCase().includes(q) ||
      String(e.totalCost).includes(q)
    );
  }, [linkable, search]);

  function pick(expense: Transaction) {
    startTransition(async () => {
      await linkBankTransactionAction(bankTxn.transaction_id, expense.id, placeholderId);
      setLinked(true);
      setTimeout(onDone, 600);
    });
  }

  if (linked) {
    return (
      <div className="text-xs text-green-600 font-semibold py-2 px-3">✓ Ligado</div>
    );
  }

  return (
    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-md bg-white" onClick={(e) => e.stopPropagation()}>
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar despesa (fornecedor, fatura, tour…)"
          className="w-full text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
        />
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Sem resultados</p>
        ) : (
          filtered.slice(0, 30).map((e) => (
            <button
              key={e.id}
              disabled={pending}
              onClick={() => pick(e)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{e.supplier || "—"}</p>
                <p className="text-[10px] text-gray-400 truncate">
                  {e.date ? fmtDate(e.date) : ""}
                  {e.invoiceId ? ` · Fatura ${e.invoiceId}` : ""}
                  {e.tourName ? ` · ${e.tourName}` : ""}
                  {e.paymentMethod ? ` · ${e.paymentMethod}` : ""}
                </p>
                {(e.iva6 > 0 || e.iva13 > 0 || e.iva23 > 0) && (
                  <p className="text-[10px] text-gray-300 truncate">
                    {e.iva6 > 0 && `IVA 6% ${fmtEur(e.iva6)} `}
                    {e.iva13 > 0 && `IVA 13% ${fmtEur(e.iva13)} `}
                    {e.iva23 > 0 && `IVA 23% ${fmtEur(e.iva23)}`}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-gray-700">{fmtEur(e.totalCost)}</p>
                {e.invoiceImageUrl && <p className="text-[10px] text-blue-400">📄 fatura</p>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function LedgerRow({
  bankTxn,
  matched,
  placeholderId,
  linkable,
}: {
  bankTxn: StoredTransaction;
  matched?: Transaction;
  placeholderId?: string;
  linkable: Transaction[];
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissPending, startDismiss] = useTransition();

  if (dismissed) return null;

  const isMatched = !!matched;

  function dismiss() {
    if (!placeholderId) return;
    startDismiss(async () => {
      await dismissUnmatchedAction(placeholderId);
      setDismissed(true);
    });
  }

  return (
    <div className={`border-b border-gray-100 last:border-0 ${isMatched ? "" : "bg-orange-50/40"}`}>
      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[180px_1fr_90px_1fr_auto] gap-x-4 items-start px-4 py-3">

        {/* ── Bank side ── */}
        <div className="hidden md:block">
          <p className="text-xs font-medium text-gray-700">
            {bankTxn.transaction_date ? fmtDate(bankTxn.transaction_date) : "—"}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {bankTxn.booking_date && bankTxn.booking_date !== bankTxn.transaction_date
              ? `Liquidado ${fmtDate(bankTxn.booking_date)}`
              : bankTxn.institution_name}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">
            {bankTxn.merchant_name || bankTxn.remittance_info || "—"}
          </p>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">
            <span className="md:hidden">{bankTxn.transaction_date ? fmtDate(bankTxn.transaction_date) : ""} · </span>
            Ref: {bankTxn.transaction_id}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs font-bold text-gray-800">{fmtEur(Math.abs(bankTxn.amount))}</p>
        </div>

        {/* ── Notion side ── */}
        <div className="min-w-0 col-span-1">
          {isMatched ? (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-gray-800 truncate">{matched.supplier || "—"}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                <span className="font-semibold text-gray-700">{fmtEur(matched.totalCost)}</span>
                {matched.date && <span>{fmtDate(matched.date)}</span>}
                {matched.invoiceId && <span>Fatura {matched.invoiceId}</span>}
                {matched.tourName && <span>· {matched.tourName}</span>}
              </div>
              {/* IVA breakdown — only if any IVA is non-zero */}
              {(matched.iva6 > 0 || matched.iva13 > 0 || matched.iva23 > 0) && (
                <div className="flex gap-x-2 text-[10px] text-gray-400">
                  {matched.iva6  > 0 && <span>IVA 6% {fmtEur(matched.iva6)}</span>}
                  {matched.iva13 > 0 && <span>IVA 13% {fmtEur(matched.iva13)}</span>}
                  {matched.iva23 > 0 && <span>IVA 23% {fmtEur(matched.iva23)}</span>}
                  {matched.taxFree > 0 && <span>S/IVA {fmtEur(matched.taxFree)}</span>}
                </div>
              )}
              {/* Invoice image link */}
              {matched.invoiceImageUrl && (
                <a
                  href={matched.invoiceImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  📄 Ver fatura
                </a>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[10px] text-orange-500 font-semibold">Sem correspondência</p>
              {open && (
                <ExpensePicker
                  bankTxn={bankTxn}
                  placeholderId={placeholderId}
                  linkable={linkable}
                  onDone={() => setOpen(false)}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-2 shrink-0">
          {isMatched ? (
            <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Matched</span>
          ) : (
            <>
              <button
                onClick={() => setOpen((o) => !o)}
                className="text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-full transition-colors"
              >
                {open ? "Fechar" : "🔗 Ligar"}
              </button>
              {placeholderId && (
                <button
                  disabled={dismissPending}
                  onClick={dismiss}
                  className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                >
                  Dispensar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BankLedger({
  bankTxns,
  matchedMap,
  unmatchedPlaceholderMap,
  linkable,
}: {
  bankTxns: StoredTransaction[];           // all debits from Neon
  matchedMap: Record<string, Transaction>; // bankRef → Notion tx
  unmatchedPlaceholderMap: Record<string, string>; // bankRef → Notion placeholder ID
  linkable: Transaction[];                 // Notion expenses available to link
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const debits = useMemo(
    () => bankTxns.filter((t) => t.credit_debit === "DBIT"),
    [bankTxns]
  );

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return debits.filter((t) => {
      const isMatched = !!matchedMap[t.transaction_id];
      if (filter === "matched"   && !isMatched) return false;
      if (filter === "unmatched" && isMatched)  return false;
      if (!q) return true;
      const m = matchedMap[t.transaction_id];
      return (
        (t.merchant_name  ?? "").toLowerCase().includes(q) ||
        (t.remittance_info ?? "").toLowerCase().includes(q) ||
        t.transaction_id.toLowerCase().includes(q) ||
        (m?.supplier ?? "").toLowerCase().includes(q) ||
        (m?.invoiceId ?? "").toLowerCase().includes(q)
      );
    });
  }, [debits, filter, search, matchedMap]);

  const matchedCount   = debits.filter((t) => !!matchedMap[t.transaction_id]).length;
  const unmatchedCount = debits.length - matchedCount;

  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1 text-xs font-semibold">
          {(["all", "matched", "unmatched"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filter === f ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "all" ? `Todos (${debits.length})` : f === "matched" ? `Matched (${matchedCount})` : `Sem match (${unmatchedCount})`}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar…"
          className="flex-1 text-xs bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#667470] transition-colors"
        />
      </div>

      {/* Table header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[180px_1fr_90px_1fr_auto] gap-x-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <span>Data</span>
          <span>Descrição banco</span>
          <span className="text-right">Valor</span>
          <span>Despesa Notion</span>
          <span />
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Sem transações para mostrar</p>
        ) : (
          rows.map((t) => (
            <LedgerRow
              key={t.transaction_id}
              bankTxn={t}
              matched={matchedMap[t.transaction_id]}
              placeholderId={unmatchedPlaceholderMap[t.transaction_id]}
              linkable={linkable}
            />
          ))
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        {rows.length} transação{rows.length !== 1 ? "ões" : ""} · apenas débitos · últimos 90 dias
      </p>
    </div>
  );
}
