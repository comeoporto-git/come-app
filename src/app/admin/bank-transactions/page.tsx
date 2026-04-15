import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getStoredTransactions } from "@/lib/enablebanking";
import Link from "next/link";

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { days: daysParam } = await searchParams;
  const days = Math.min(parseInt(daysParam ?? "30", 10) || 30, 90);

  const txns = await getStoredTransactions(days);

  const debits  = txns.filter((t) => t.credit_debit === "DBIT");
  const credits = txns.filter((t) => t.credit_debit === "CRDT");
  const totalOut = debits.reduce((s, t) => s + Number(t.amount), 0);
  const totalIn  = credits.reduce((s, t) => s + Number(t.amount), 0);

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
            <p className="text-xl font-bold text-[#32373c]">{txns.length}</p>
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

        {txns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center text-gray-400">
            <div className="text-3xl mb-2">🏦</div>
            <p className="text-sm font-medium">Sem movimentos nos últimos {days} dias</p>
            <p className="text-xs mt-1">
              Clica em{" "}
              <Link href="/admin" className="underline text-[#667470]">
                Sincronizar Agora
              </Link>{" "}
              para importar transações do banco.
            </p>
          </div>
        ) : (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                {txns.length} movimentos · últimos {days} dias
              </p>
            </div>
            <ul className="divide-y divide-gray-50">
              {txns.map((txn) => {
                const isDebit = txn.credit_debit === "DBIT";
                const label = txn.merchant_name ?? txn.remittance_info ?? "—";
                return (
                  <li key={txn.transaction_id} className="px-5 py-3 flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 font-bold ${
                        isDebit ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"
                      }`}
                    >
                      {isDebit ? "↑" : "↓"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#32373c] truncate">{label}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(txn.transaction_date).toLocaleDateString("pt-PT")}
                        {txn.institution_name && (
                          <span className="ml-2 text-gray-300">{txn.institution_name}</span>
                        )}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold flex-shrink-0 ${isDebit ? "text-red-600" : "text-green-600"}`}>
                      {isDebit ? "-" : "+"}{Number(txn.amount).toFixed(2)}€
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
