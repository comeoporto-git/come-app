"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { linkBankTransactionAction, dismissUnmatchedAction, runManualMatchAction, unlinkBankTransactionAction } from "@/actions/banking";
import type { StoredTransaction } from "@/lib/enablebanking";
import type { Transaction } from "@/lib/notion";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtEur(n: number) {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

type Filter     = "all" | "matched" | "unmatched" | "partial";
type TypeFilter = "all" | "debit" | "credit";

// ── Inline expense picker ─────────────────────────────────────────────────────

function ExpensePicker({
  bankTxn, placeholderId, linkable, linkedIds, onDone,
}: {
  bankTxn: StoredTransaction;
  placeholderId?: string;
  linkable: Transaction[];
  linkedIds: Set<string>; // Notion IDs already linked to other bank txns
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [linked, setLinked] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q    = search.toLowerCase().trim();
    const qDot = q.replace(",", ".");
    // Exclude expenses already linked to a different bank transaction
    const available = linkable.filter((e) => !linkedIds.has(e.id));
    if (!q) return available;
    return available.filter((e) =>
      e.supplier.toLowerCase().includes(q) ||
      e.invoiceId.toLowerCase().includes(q) ||
      (e.tourName ?? "").toLowerCase().includes(q) ||
      (e.paymentMethod ?? "").toLowerCase().includes(q) ||
      String(Math.abs(e.totalCost)).includes(qDot) ||
      fmtEur(Math.abs(e.totalCost)).includes(q)
    );
  }, [linkable, linkedIds, search]);

  function pick(expense: Transaction) {
    startTransition(async () => {
      await linkBankTransactionAction(bankTxn.transaction_id, expense.id, placeholderId);
      setLinked(expense.id);
      setTimeout(onDone, 500);
    });
  }

  return (
    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-md bg-white" onClick={(e) => e.stopPropagation()}>
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por fornecedor, fatura, tour, valor…"
          className="w-full text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
        />
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Sem resultados</p>
        ) : (
          filtered.slice(0, 30).map((e) => (
            <button
              key={e.id}
              disabled={pending}
              onClick={() => pick(e)}
              className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-start justify-between gap-3 ${linked === e.id ? "bg-green-50" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {linked === e.id ? "✓ " : ""}{e.supplier || "—"}
                </p>
                <p className="text-[10px] text-gray-400 truncate">
                  {e.date ? fmtDate(e.date) : ""}
                  {e.invoiceId ? ` · Fatura ${e.invoiceId}` : ""}
                  {e.tourName ? ` · ${e.tourName}` : ""}
                  {e.paymentMethod ? ` · ${e.paymentMethod}` : ""}
                </p>
                {(e.iva6 > 0 || e.iva13 > 0 || e.iva23 > 0) && (
                  <p className="text-[10px] text-gray-300">
                    {e.iva6  > 0 && `IVA 6% ${fmtEur(e.iva6)} `}
                    {e.iva13 > 0 && `IVA 13% ${fmtEur(e.iva13)} `}
                    {e.iva23 > 0 && `IVA 23% ${fmtEur(e.iva23)}`}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-gray-700">{fmtEur(Math.abs(e.totalCost))}</p>
                {e.invoiceImageUrl && <p className="text-[10px] text-blue-400">📄</p>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function UnlinkButton({ notionId, onUnlinked }: { notionId: string; onUnlinked: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)}
        className="text-[10px] text-gray-300 hover:text-red-400 transition-colors ml-1" title="Remover ligação">
        ✕
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 ml-1">
      <button
        disabled={pending}
        onClick={() => startTransition(async () => { await unlinkBankTransactionAction(notionId); onUnlinked(); })}
        className="text-[10px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-50">
        {pending ? "…" : "Confirmar"}
      </button>
      <button onClick={() => setConfirming(false)} className="text-[10px] text-gray-400">Cancelar</button>
    </span>
  );
}

function LedgerRow({
  bankTxn, matched, placeholderId, linkableExpenses, linkableEarnings, linkedIds,
}: {
  bankTxn: StoredTransaction;
  matched: Transaction[];          // may be empty; may have multiple
  placeholderId?: string;
  linkableExpenses: Transaction[];
  linkableEarnings: Transaction[];
  linkedIds: Set<string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissPending, startDismiss] = useTransition();

  if (dismissed) return null;

  const isCredit   = bankTxn.credit_debit === "CRDT";
  const bankAmount = Math.abs(bankTxn.amount);
  const linkable   = isCredit ? linkableEarnings : linkableExpenses;

  // Sum of all linked Notion records
  const matchedTotal = matched.reduce((s, t) => s + Math.abs(t.totalCost), 0);
  const remaining    = bankAmount - matchedTotal;
  const isMatched    = matched.length > 0;
  const isFullMatch  = isMatched && Math.abs(remaining) <= 0.05;
  const isPartial    = isMatched && !isFullMatch;

  function dismiss() {
    if (!placeholderId) return;
    startDismiss(async () => { await dismissUnmatchedAction(placeholderId); setDismissed(true); });
  }

  return (
    <div className={`border-b border-gray-100 last:border-0 ${
      !isMatched  ? (isCredit ? "bg-blue-50/30" : "bg-orange-50/30") :
      isPartial   ? "bg-yellow-50/40" : ""
    }`}>
      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[160px_1fr_100px_1fr_auto] gap-x-4 items-start px-4 py-3">

        {/* Date */}
        <div className="hidden md:block">
          <p className="text-xs font-medium text-gray-700">
            {bankTxn.transaction_date ? fmtDate(bankTxn.transaction_date) : "—"}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {bankTxn.booking_date && bankTxn.booking_date !== bankTxn.transaction_date
              ? `Liq. ${fmtDate(bankTxn.booking_date)}`
              : bankTxn.institution_name}
          </p>
        </div>

        {/* Bank description */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isCredit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              {isCredit ? "CRÉDITO" : "DÉBITO"}
            </span>
          </div>
          <p className="text-xs font-semibold text-gray-800 truncate">
            {bankTxn.merchant_name || bankTxn.remittance_info || "—"}
          </p>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">
            <span className="md:hidden">{bankTxn.transaction_date ? fmtDate(bankTxn.transaction_date) : ""} · </span>
            Ref: {bankTxn.transaction_id}
          </p>
        </div>

        {/* Amount */}
        <div className="text-right">
          <p className={`text-xs font-bold ${isCredit ? "text-green-600" : "text-gray-800"}`}>
            {isCredit ? "+" : ""}{fmtEur(bankAmount)}
          </p>
          {isPartial && (
            <p className="text-[10px] text-yellow-600 font-semibold mt-0.5">
              {fmtEur(remaining)} por ligar
            </p>
          )}
        </div>

        {/* Notion side — list of all linked records */}
        <div className="min-w-0 col-span-1 space-y-2">
          {matched.map((m, idx) => (
            <div key={m.id} className={`${idx > 0 ? "border-t border-gray-100 pt-2" : ""}`}>
              <div className="flex items-center gap-1">
                <p className="text-xs font-semibold text-gray-800 truncate flex-1">{m.supplier || "—"}</p>
                <UnlinkButton notionId={m.id} onUnlinked={() => router.refresh()} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                <span className="font-semibold text-gray-700">{fmtEur(Math.abs(m.totalCost))}</span>
                {m.date && <span>{fmtDate(m.date)}</span>}
                {m.invoiceId && <span>Fatura {m.invoiceId}</span>}
                {m.tourName && <span>· {m.tourName}</span>}
              </div>
              {(m.iva6 > 0 || m.iva13 > 0 || m.iva23 > 0) && (
                <div className="flex gap-x-2 text-[10px] text-gray-400">
                  {m.iva6  > 0 && <span>IVA 6% {fmtEur(m.iva6)}</span>}
                  {m.iva13 > 0 && <span>IVA 13% {fmtEur(m.iva13)}</span>}
                  {m.iva23 > 0 && <span>IVA 23% {fmtEur(m.iva23)}</span>}
                  {m.taxFree > 0 && <span>S/IVA {fmtEur(m.taxFree)}</span>}
                </div>
              )}
              {m.invoiceImageUrl && (
                <a href={m.invoiceImageUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700"
                  onClick={(e) => e.stopPropagation()}>
                  📄 Ver fatura
                </a>
              )}
            </div>
          ))}

          {/* Total bar when multiple records linked */}
          {matched.length > 1 && (
            <div className={`flex items-center justify-between text-[10px] font-semibold pt-1 border-t border-gray-100 ${isFullMatch ? "text-green-600" : "text-yellow-600"}`}>
              <span>Total ligado ({matched.length} registos)</span>
              <span>{fmtEur(matchedTotal)} / {fmtEur(bankAmount)}</span>
            </div>
          )}

          {!isMatched && (
            <p className="text-[10px] text-orange-500 font-semibold">
              Sem correspondência · {isCredit ? "receita" : "despesa"}
            </p>
          )}

          {open && (
            <ExpensePicker
              bankTxn={bankTxn}
              placeholderId={placeholderId}
              linkable={linkable}
              linkedIds={linkedIds}
              onDone={() => setOpen(false)}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {isFullMatch ? (
            <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓</span>
          ) : (
            <button
              onClick={() => setOpen((o) => !o)}
              className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                isPartial
                  ? "text-yellow-700 bg-yellow-100 hover:bg-yellow-200"
                  : "text-blue-600 bg-blue-50 hover:bg-blue-100"
              }`}
            >
              {open ? "Fechar" : isPartial ? "🔗 Ligar mais" : "🔗 Ligar"}
            </button>
          )}
          {/* Always allow adding more links even on fully matched rows */}
          {isFullMatch && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
            >
              {open ? "Fechar" : "+ Ligar mais"}
            </button>
          )}
          {!isMatched && placeholderId && (
            <button
              disabled={dismissPending}
              onClick={dismiss}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
            >
              Dispensar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI Match button ───────────────────────────────────────────────────────────

function AutoMatchButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ matched: number; skipped: number; errors: string[] } | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await runManualMatchAction();
      setResult(res);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={run} disabled={pending}
        className="flex items-center gap-2 px-4 py-2 bg-[#32373c] hover:bg-[#32373c]/80 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50">
        {pending ? <><span className="animate-spin">⚙️</span> A processar…</> : <>🤖 Correspondência Automática</>}
      </button>
      {result && (
        <p className={`text-[10px] font-semibold ${result.matched > 0 ? "text-green-600" : "text-gray-400"}`}>
          {result.matched > 0 ? `✓ ${result.matched} novas correspondências` : "Sem novas correspondências"}
          {result.errors.length > 0 && ` · ${result.errors.length} erros`}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BankLedger({
  bankTxns, matchedMap, unmatchedPlaceholderMap, linkableExpenses, linkableEarnings, oldestDate,
}: {
  bankTxns: StoredTransaction[];
  matchedMap: Record<string, Transaction[]>;
  unmatchedPlaceholderMap: Record<string, string>;
  linkableExpenses: Transaction[];
  linkableEarnings: Transaction[];
  oldestDate?: string;
}) {
  const [filter,     setFilter]     = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search,     setSearch]     = useState("");

  function matchStatus(t: StoredTransaction): "full" | "partial" | "none" {
    const list = matchedMap[t.transaction_id] ?? [];
    if (list.length === 0) return "none";
    const total   = list.reduce((s, m) => s + Math.abs(m.totalCost), 0);
    const bankAmt = Math.abs(t.amount);
    return Math.abs(total - bankAmt) <= 0.05 ? "full" : "partial";
  }

  const rows = useMemo(() => {
    const q    = search.toLowerCase().trim();
    const qDot = q.replace(",", ".");
    return bankTxns.filter((t) => {
      const status = matchStatus(t);
      if (filter === "matched"   && status === "none") return false;
      if (filter === "unmatched" && status !== "none") return false;
      if (filter === "partial"   && status !== "partial") return false;
      if (typeFilter === "debit"  && t.credit_debit !== "DBIT") return false;
      if (typeFilter === "credit" && t.credit_debit !== "CRDT") return false;
      if (!q) return true;
      const matches = matchedMap[t.transaction_id] ?? [];
      return (
        (t.merchant_name   ?? "").toLowerCase().includes(q) ||
        (t.remittance_info ?? "").toLowerCase().includes(q) ||
        t.transaction_id.toLowerCase().includes(q) ||
        String(Math.abs(t.amount)).includes(qDot) ||
        fmtEur(Math.abs(t.amount)).includes(q) ||
        matches.some((m) =>
          (m.supplier ?? "").toLowerCase().includes(q) ||
          (m.invoiceId ?? "").toLowerCase().includes(q)
        )
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankTxns, filter, typeFilter, search, matchedMap]);

  // All Notion IDs already linked to any bank transaction
  const linkedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const txns of Object.values(matchedMap)) {
      for (const t of txns) ids.add(t.id);
    }
    return ids;
  }, [matchedMap]);

  const fullCount    = bankTxns.filter((t) => matchStatus(t) === "full").length;
  const partialCount = bankTxns.filter((t) => matchStatus(t) === "partial").length;
  const noneCount    = bankTxns.filter((t) => matchStatus(t) === "none").length;
  const debitCount   = bankTxns.filter((t) => t.credit_debit === "DBIT").length;
  const creditCount  = bankTxns.filter((t) => t.credit_debit === "CRDT").length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-start">
        <AutoMatchButton />
        <div className="flex-1 min-w-0">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por descrição, fornecedor, fatura, valor…"
            className="w-full text-xs bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#667470] transition-colors" />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1 text-xs font-semibold">
          {([
            ["all",       `Todos (${bankTxns.length})`],
            ["matched",   `✓ Completo (${fullCount})`],
            ["partial",   `◑ Parcial (${partialCount})`],
            ["unmatched", `○ Sem match (${noneCount})`],
          ] as [Filter, string][]).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg transition-all ${filter === f ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1 text-xs font-semibold">
          {([
            ["all",    "Ambos"],
            ["debit",  `Débitos (${debitCount})`],
            ["credit", `Créditos (${creditCount})`],
          ] as [TypeFilter, string][]).map(([f, label]) => (
            <button key={f} onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 rounded-lg transition-all ${typeFilter === f ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[160px_1fr_100px_1fr_auto] gap-x-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <span>Data</span>
          <span>Transação Banco</span>
          <span className="text-right">Valor</span>
          <span>Registo(s) Notion</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Sem transações para mostrar</p>
        ) : (
          rows.map((t) => (
            <LedgerRow
              key={t.transaction_id}
              bankTxn={t}
              matched={matchedMap[t.transaction_id] ?? []}
              placeholderId={unmatchedPlaceholderMap[t.transaction_id]}
              linkableExpenses={linkableExpenses}
              linkableEarnings={linkableEarnings}
              linkedIds={linkedIds}
            />
          ))
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        {rows.length} de {bankTxns.length} transações
        {oldestDate ? ` · desde ${new Date(oldestDate).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })}` : ""}
        {" · PSD2 disponibiliza máx. 90 dias de histórico"}
      </p>
    </div>
  );
}
