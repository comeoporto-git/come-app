import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getAccountantTransactions, getMatchedTransactions, getUnmatchedBankTransactions } from "@/lib/notion";
import { getStoredTransactions } from "@/lib/enablebanking";
import { VerifyButton } from "@/components/VerifyButton";
import { ExportCSVButton } from "@/components/ExportCSVButton";
import Link from "next/link";

function fmt(n: number) {
  return `€${n.toFixed(2)}`;
}

export default async function AccountantPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; days?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Accountant" && session.user.role !== "Admin") redirect("/");

  const { tab = "movimentos", days: daysParam } = await searchParams;
  const days = Math.min(parseInt(daysParam ?? "30", 10) || 30, 90);

  const [transactions, bankTxns, matchedExpenses, unmatchedEntries] = await Promise.all([
    getAccountantTransactions(),
    getStoredTransactions(days),
    getMatchedTransactions(),
    getUnmatchedBankTransactions(),
  ]);

  // Join: bankReference → Notion expense
  const matchedByRef = new Map(matchedExpenses.map((e) => [e.bankReference, e]));
  const annotated = bankTxns.map((txn) => ({
    ...txn,
    invoice: matchedByRef.get(txn.transaction_id) ?? null,
  }));

  const debits     = annotated.filter((t) => t.credit_debit === "DBIT");
  const credits    = annotated.filter((t) => t.credit_debit === "CRDT");
  const totalOut   = debits.reduce((s, t) => s + Number(t.amount), 0);
  const totalIn    = credits.reduce((s, t) => s + Number(t.amount), 0);
  const matchedCount = debits.filter((t) => t.invoice).length;
  const invoiceTotal = transactions.reduce((s, t) => s + t.totalCost, 0);

  return (
    <div className="min-h-screen bg-gray-50 text-[#32373c]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Portal Contabilidade</h1>
            <p className="text-xs text-gray-400">COME Porto Food Tours</p>
          </div>
          <div className="flex items-center gap-3">
            {tab === "faturas" && <ExportCSVButton transactions={transactions} />}
            <Link href="/profile" className="text-xs text-gray-400 hover:text-[#667470] transition-colors">Perfil</Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="text-xs text-gray-400 hover:text-red-500 transition-colors">Sair</button>
            </form>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-0 border-t border-gray-100">
          {[
            { key: "movimentos", label: "Movimentos Bancários" },
            { key: "faturas",    label: "Faturas" },
          ].map(({ key, label }) => (
            <Link
              key={key}
              href={`?tab=${key}&days=${days}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-[#667470] text-[#32373c]"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* ── MOVIMENTOS TAB ── */}
        {tab === "movimentos" && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-1">Movimentos</p>
                <p className="text-xl font-bold text-gray-900">{bankTxns.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-1">Saídas</p>
                <p className="text-xl font-bold text-red-600">-{totalOut.toFixed(2)}€</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-1">Entradas</p>
                <p className="text-xl font-bold text-green-600">+{totalIn.toFixed(2)}€</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-1">Com fatura</p>
                <p className="text-xl font-bold text-[#667470]">{matchedCount}/{debits.length}</p>
              </div>
            </div>

            {/* Day range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Período:</span>
              {[7, 30, 60, 90].map((d) => (
                <Link key={d} href={`?tab=movimentos&days=${d}`}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    days === d ? "bg-[#667470] text-white" : "bg-white border border-gray-200 text-gray-500 hover:border-[#667470]"
                  }`}>
                  {d} dias
                </Link>
              ))}
            </div>

            {bankTxns.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-16 text-center text-gray-400">
                <div className="text-4xl mb-3">🏦</div>
                <p className="text-sm font-medium text-gray-600">Sem movimentos bancários importados</p>
                <p className="text-xs mt-1">O Admin deve clicar em &quot;Sincronizar Agora&quot; para importar transações.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Data</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Descrição banco</th>
                        <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Valor</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Fatura</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Fornecedor</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Nº Fatura</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {annotated.map((txn) => {
                        const isDebit = txn.credit_debit === "DBIT";
                        const inv = txn.invoice;
                        return (
                          <tr key={txn.transaction_id}
                            className={inv ? "bg-green-50/20" : isDebit ? "bg-orange-50/20" : ""}>
                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                              {new Date(txn.transaction_date).toLocaleDateString("pt-PT")}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-800 max-w-[180px] truncate">
                              {txn.merchant_name ?? txn.remittance_info ?? "—"}
                            </td>
                            <td className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${isDebit ? "text-red-600" : "text-green-600"}`}>
                              {isDebit ? "-" : "+"}{Number(txn.amount).toFixed(2)}€
                            </td>
                            <td className="px-4 py-3">
                              {inv?.invoiceImageUrl ? (
                                <a href={inv.invoiceImageUrl} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={inv.invoiceImageUrl} alt="Fatura"
                                    className="w-9 h-9 object-cover rounded-lg border border-gray-200 hover:scale-110 transition-transform" />
                                </a>
                              ) : inv ? (
                                <span className="text-gray-300 text-lg">📄</span>
                              ) : isDebit ? (
                                <span className="text-xs text-orange-400 font-medium">Sem fatura</span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{inv?.supplier ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{inv?.invoiceId || "—"}</td>
                            <td className="px-4 py-3">
                              {inv ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                  Matched
                                </span>
                              ) : isDebit ? (
                                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                                  Sem fatura
                                </span>
                              ) : (
                                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                                  Entrada
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-gray-50">
                  {annotated.map((txn) => {
                    const isDebit = txn.credit_debit === "DBIT";
                    const inv = txn.invoice;
                    return (
                      <div key={txn.transaction_id} className="px-4 py-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              !isDebit ? "bg-green-100 text-green-600" : inv ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-500"
                            }`}>
                              {!isDebit ? "↓" : inv ? "✓" : "!"}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800 leading-tight">
                                {txn.merchant_name ?? txn.remittance_info ?? "—"}
                              </p>
                              <p className="text-xs text-gray-400">
                                {new Date(txn.transaction_date).toLocaleDateString("pt-PT")}
                              </p>
                            </div>
                          </div>
                          <p className={`text-sm font-bold flex-shrink-0 ${isDebit ? "text-red-600" : "text-green-600"}`}>
                            {isDebit ? "-" : "+"}{Number(txn.amount).toFixed(2)}€
                          </p>
                        </div>
                        {inv && (
                          <div className="ml-9 bg-green-50 rounded-xl px-3 py-2 flex items-center gap-3">
                            {inv.invoiceImageUrl && (
                              <a href={inv.invoiceImageUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={inv.invoiceImageUrl} alt="Fatura"
                                  className="w-10 h-10 object-cover rounded-lg border border-green-200" />
                              </a>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-green-800 truncate">{inv.supplier}</p>
                              {inv.invoiceId && <p className="text-xs text-green-600">{inv.invoiceId}</p>}
                            </div>
                          </div>
                        )}
                        {isDebit && !inv && (
                          <p className="ml-9 text-xs text-orange-500 font-medium">Sem fatura associada</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notion-only unmatched entries */}
            {unmatchedEntries.length > 0 && (
              <div className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-orange-50">
                  <p className="text-xs font-semibold text-orange-500 uppercase tracking-widest">
                    Débitos sem correspondência bancária ({unmatchedEntries.length})
                  </p>
                </div>
                <ul className="divide-y divide-gray-50">
                  {unmatchedEntries.map((e) => (
                    <li key={e.id} className="px-4 py-3 flex items-center gap-3">
                      <span className="text-lg">❓</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{e.supplier}</p>
                        <p className="text-xs text-gray-400">
                          {e.date ? new Date(e.date).toLocaleDateString("pt-PT") : "—"} · {e.paymentMethod}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-orange-600 flex-shrink-0">
                        -{e.totalCost.toFixed(2)}€
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ── FATURAS TAB ── */}
        {tab === "faturas" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {transactions.length} faturas · Total: <span className="font-semibold text-gray-800">{fmt(invoiceTotal)}</span>
              </p>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Fatura", "Data", "Fornecedor", "Nº Fatura", "Base S/ IVA", "IVA 6%", "IVA 13%", "IVA 23%", "Total", "Status", "Pag.", "Verificado"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className={tx.accountantVerified ? "bg-green-50/30" : ""}>
                      <td className="px-3 py-2.5">
                        {tx.invoiceImageUrl ? (
                          <a href={tx.invoiceImageUrl} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={tx.invoiceImageUrl} alt="Fatura"
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200 hover:scale-105 transition-transform" />
                          </a>
                        ) : (
                          <span className="text-gray-200 text-lg">📄</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[#32373c] whitespace-nowrap">{tx.date ?? "—"}</td>
                      <td className="px-3 py-2.5 font-medium text-[#32373c]">{tx.supplier}</td>
                      <td className="px-3 py-2.5 text-[#32373c]">{tx.invoiceId || "—"}</td>
                      <td className="px-3 py-2.5 text-right text-[#32373c]">{fmt(tx.taxFree)}</td>
                      <td className="px-3 py-2.5 text-right text-[#32373c]">{tx.iva6 ? fmt(tx.iva6) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-[#32373c]">{tx.iva13 ? fmt(tx.iva13) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-[#32373c]">{tx.iva23 ? fmt(tx.iva23) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-[#32373c]">{fmt(tx.totalCost)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          tx.status === "Paid" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        }`}>{tx.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[#32373c] text-xs">{tx.paymentMethod}</td>
                      <td className="px-3 py-2.5">
                        <VerifyButton transactionId={tx.id} verified={tx.accountantVerified} disabled={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2 ${tx.accountantVerified ? "border-green-200" : ""}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {tx.invoiceImageUrl && (
                        <a href={tx.invoiceImageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={tx.invoiceImageUrl} alt="Fatura" className="w-12 h-12 object-cover rounded-xl border border-gray-200" />
                        </a>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900">{tx.supplier}</p>
                        <p className="text-xs text-gray-400">{tx.date ?? "—"}</p>
                      </div>
                    </div>
                    <p className="font-bold text-gray-900 shrink-0">{fmt(tx.totalCost)}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap text-xs text-gray-400">
                    {tx.iva6 > 0 && <span>6%: {fmt(tx.iva6)}</span>}
                    {tx.iva13 > 0 && <span>13%: {fmt(tx.iva13)}</span>}
                    {tx.iva23 > 0 && <span>23%: {fmt(tx.iva23)}</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{tx.status}</span>
                    <VerifyButton transactionId={tx.id} verified={tx.accountantVerified} disabled={false} />
                  </div>
                </div>
              ))}
            </div>

            {transactions.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-2">📊</div>
                <p>Sem faturas para verificar</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
