import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEBSessions, getAccountTransactions, type EBTransaction } from "@/lib/enablebanking";
import Link from "next/link";

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatAmount(txn: EBTransaction) {
  const amount = parseFloat(txn.transaction_amount.amount);
  const sign = txn.credit_debit_indicator === "DBIT" ? "-" : "+";
  return `${sign}${amount.toFixed(2)} ${txn.transaction_amount.currency}`;
}

function merchantName(txn: EBTransaction) {
  if (txn.credit_debit_indicator === "DBIT") {
    return txn.creditor?.name ?? txn.remittance_information ?? "—";
  }
  return txn.debtor?.name ?? txn.remittance_information ?? "—";
}

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { days: daysParam } = await searchParams;
  const days = Math.min(parseInt(daysParam ?? "30", 10) || 30, 90);

  const dateTo   = formatDate(new Date());
  const dateFrom = formatDate(new Date(Date.now() - days * 86_400_000));

  const sessions = await getEBSessions();

  const allTxns: (EBTransaction & { accountId: string; institution: string })[] = [];

  const errors: string[] = [];

  console.log("[BankTxns] sessions:", sessions.map(s => ({ id: s.session_id, accounts: s.accountIds })));

  await Promise.all(
    sessions.flatMap((s) => {
      if (s.accountIds.length === 0) {
        errors.push(`Session ${s.session_id} has no account IDs`);
        return [];
      }
      return s.accountIds.map(async (accountId) => {
            try {
              const txns = await getAccountTransactions(accountId, dateFrom, dateTo);
              console.log(`[BankTxns] account ${accountId}: ${txns.length} txns`);
              txns.forEach((t) => allTxns.push({ ...t, accountId, institution: s.institution_name }));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[BankTxns] account ${accountId} error:`, msg);
              errors.push(`${accountId}: ${msg}`);
            }
          });
    })
  );

  // Sort newest first
  allTxns.sort((a, b) =>
    new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
  );

  const debits  = allTxns.filter((t) => t.credit_debit_indicator === "DBIT");
  const credits = allTxns.filter((t) => t.credit_debit_indicator === "CRDT");
  const totalOut = debits.reduce((s, t) => s + parseFloat(t.transaction_amount.amount), 0);
  const totalIn  = credits.reduce((s, t) => s + parseFloat(t.transaction_amount.amount), 0);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-white/60 hover:text-white text-sm transition-colors">
              ← Admin
            </Link>
            <span className="text-white/30">/</span>
            <span className="text-sm font-semibold text-white">Movimentos Bancários</span>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 60, 90].map((d) => (
              <Link
                key={d}
                href={`?days=${d}`}
                className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                  days === d
                    ? "bg-white text-[#32373c]"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Transações</p>
            <p className="text-xl font-bold text-[#32373c]">{allTxns.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Saídas</p>
            <p className="text-xl font-bold text-red-600">-{totalOut.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">Entradas</p>
            <p className="text-xl font-bold text-green-600">+{totalIn.toFixed(2)}€</p>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
            ))}
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center text-gray-400">
            <div className="text-3xl mb-2">🏦</div>
            <p className="text-sm">Nenhuma conta bancária ligada</p>
            <Link href="/admin" className="text-xs text-[#667470] underline mt-2 inline-block">
              Ligar conta
            </Link>
          </div>
        ) : sessions.every((s) => s.accountIds.length === 0) ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-700">
            ⚠️ Conta ligada mas sem IDs de conta guardados. Desliga e volta a ligar a conta no{" "}
            <Link href="/admin" className="underline">Admin</Link>.
          </div>
        ) : allTxns.length === 0 && errors.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center text-gray-400">
            <p className="text-sm">Sem movimentos nos últimos {days} dias</p>
          </div>
        ) : (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                {allTxns.length} movimentos · últimos {days} dias
              </p>
              <p className="text-xs text-gray-400">{sessions[0].institution_name}</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {allTxns.map((txn) => {
                const isDebit = txn.credit_debit_indicator === "DBIT";
                const amount  = parseFloat(txn.transaction_amount.amount);
                return (
                  <li key={txn.transaction_id} className="px-5 py-3 flex items-center gap-3">
                    {/* Icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                        isDebit ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"
                      }`}
                    >
                      {isDebit ? "↑" : "↓"}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#32373c] truncate">
                        {merchantName(txn)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(txn.transaction_date).toLocaleDateString("pt-PT")}
                        {txn.remittance_information && (
                          <span className="ml-2 truncate">{txn.remittance_information}</span>
                        )}
                      </p>
                    </div>

                    {/* Amount */}
                    <p
                      className={`text-sm font-semibold flex-shrink-0 ${
                        isDebit ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {isDebit ? "-" : "+"}{amount.toFixed(2)}€
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
