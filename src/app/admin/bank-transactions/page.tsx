import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getStoredTransactions } from "@/lib/enablebanking";
import { getMatchedTransactions, getUnmatchedBankTransactions } from "@/lib/notion";
import Link from "next/link";

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { days: daysParam, tab = "all" } = await searchParams;
  const days = Math.min(parseInt(daysParam ?? "30", 10) || 30, 90);

  const [bankTxns, matchedExpenses, unmatchedEntries] = await Promise.all([
    getStoredTransactions(days),
    getMatchedTransactions(),
    getUnmatchedBankTransactions(),
  ]);

  // Build a lookup: bankReference → matched Notion expense
  const matchedByRef = new Map(
    matchedExpenses.map((e) => [e.bankReference, e])
  );

  // Annotate each bank transaction with its matched invoice (if any)
  const annotated = bankTxns.map((txn) => ({
    ...txn,
    invoice: matchedByRef.get(txn.transaction_id) ?? null,
  }));

  const debits  = annotated.filter((t) => t.credit_debit === "DBIT");
  const credits = annotated.filter((t) => t.credit_debit === "CRDT");
  const totalOut = debits.reduce((s, t) => s + Number(t.amount), 0);
  const totalIn  = credits.reduce((s, t) => s + Number(t.amount), 0);
  const matchedCount = debits.filter((t) => t.invoice).length;

  const displayed = tab === "credits" ? credits
    : tab === "unmatched" ? debits.filter((t) => !t.invoice)
    : tab === "matched"   ? debits.filter((t) => t.invoice)
    : annotated;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-white/60 hover:text-white text-sm transition-colors">← Admin</Link>
            <span className="text-white/30">/</span>
            <span className="text-sm font-semibold text-white">Movimentos Bancários</span>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 60, 90].map((d) => (
              <Link key={d} href={`?days=${d}&tab=${tab}`}
                className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${days === d ? "bg-white text-[#32373c]" : "text-white/60 hover:text-white"}`}>
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Total</p>
            <p className="text-xl font-bold text-[#32373c]">{bankTxns.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Saídas</p>
            <p className="text-lg font-bold text-red-600">-{totalOut.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Entradas</p>
            <p className="text-lg font-bold text-green-600">+{totalIn.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Com fatura</p>
            <p className="text-lg font-bold text-[#667470]">{matchedCount}/{debits.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-1">
          {[
            { key: "all",       label: `Todos (${annotated.length})` },
            { key: "matched",   label: `Com fatura (${matchedCount})` },
            { key: "unmatched", label: `Sem fatura (${debits.filter(t => !t.invoice).length})` },
            { key: "credits",   label: `Entradas (${credits.length})` },
          ].map(({ key, label }) => (
            <Link key={key} href={`?days=${days}&tab=${key}`}
              className={`flex-1 text-center text-xs py-2 rounded-xl font-medium transition-colors ${tab === key ? "bg-[#667470] text-white" : "text-gray-500 hover:text-[#32373c]"}`}>
              {label}
            </Link>
          ))}
        </div>

        {bankTxns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center text-gray-400">
            <div className="text-3xl mb-2">🏦</div>
            <p className="text-sm font-medium">Sem movimentos nos últimos {days} dias</p>
            <p className="text-xs mt-1">
              Clica em{" "}
              <Link href="/admin" className="underline text-[#667470]">Sincronizar Agora</Link>
              {" "}para importar transações do banco.
            </p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-8 text-center text-gray-400">
            <p className="text-sm">Nenhum movimento nesta categoria</p>
          </div>
        ) : (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {displayed.map((txn) => {
                const isDebit = txn.credit_debit === "DBIT";
                const label = txn.merchant_name ?? txn.remittance_info ?? "—";
                const inv = txn.invoice;
                return (
                  <li key={txn.transaction_id} className="px-5 py-4 flex items-start gap-3">
                    {/* Indicator */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 font-bold mt-0.5 ${
                      !isDebit ? "bg-green-50 text-green-600"
                      : inv     ? "bg-blue-50 text-blue-500"
                                : "bg-red-50 text-red-400"
                    }`}>
                      {!isDebit ? "↓" : inv ? "✓" : "↑"}
                    </div>

                    {/* Bank side */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#32373c] truncate">{label}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(txn.transaction_date).toLocaleDateString("pt-PT")}
                      </p>

                      {/* Matched invoice */}
                      {inv && (
                        <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-blue-700 truncate">
                            🧾 {inv.supplier}{inv.invoiceId ? ` · ${inv.invoiceId}` : ""}
                          </p>
                          <p className="text-xs text-blue-500">
                            {inv.paymentMethod} · {inv.status}
                            {inv.date && ` · ${new Date(inv.date).toLocaleDateString("pt-PT")}`}
                          </p>
                        </div>
                      )}

                      {/* Unmatched debit label */}
                      {isDebit && !inv && (
                        <span className="mt-1 inline-block text-xs text-orange-500 font-medium">
                          Sem fatura associada
                        </span>
                      )}
                    </div>

                    {/* Amount */}
                    <p className={`text-sm font-semibold flex-shrink-0 mt-0.5 ${isDebit ? "text-red-600" : "text-green-600"}`}>
                      {isDebit ? "-" : "+"}{Number(txn.amount).toFixed(2)}€
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Unmatched from Notion (no bank record at all) */}
        {unmatchedEntries.length > 0 && (tab === "all" || tab === "unmatched") && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold text-orange-500 uppercase tracking-widest">
                Débitos sem correspondência no banco ({unmatchedEntries.length})
              </p>
            </div>
            <ul className="divide-y divide-gray-50">
              {unmatchedEntries.map((e) => (
                <li key={e.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-sm flex-shrink-0">❓</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#32373c] truncate">{e.supplier}</p>
                    <p className="text-xs text-gray-400">
                      {e.date ? new Date(e.date).toLocaleDateString("pt-PT") : "—"}
                      {" · "}{e.paymentMethod}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-orange-500 flex-shrink-0">
                    -{e.totalCost.toFixed(2)}€
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
