import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import {
  getUnmatchedBankTransactions,
  getMatchedTransactionMap,
  getLinkableTransactions,
} from "@/lib/notion";
import { getStoredTransactions } from "@/lib/enablebanking";
import { BankLedger } from "@/components/BankLedger";
import Image from "next/image";
import Link from "next/link";

export default async function ReconciliationPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  // Fetch all data in parallel — individual failures return empty defaults
  // getLinkableTransactions() makes a SINGLE Notion query instead of two,
  // halving the API calls and preventing timeout on large datasets.
  const [bankTxns, matchedMap, unmatchedPlaceholders, linkable] = await Promise.all([
    getStoredTransactions(0).catch((e) => { console.error("[reconciliation] bankTxns:", e); return []; }),
    getMatchedTransactionMap().catch((e) => { console.error("[reconciliation] matchedMap:", e); return {} as Record<string, import("@/lib/notion").Transaction[]>; }),
    getUnmatchedBankTransactions().catch((e) => { console.error("[reconciliation] unmatched:", e); return []; }),
    getLinkableTransactions().catch((e) => { console.error("[reconciliation] linkable:", e); return { expenses: [], earnings: [] }; }),
  ]);
  const linkableExpenses = linkable.expenses;
  const linkableEarnings = linkable.earnings;

  // Build a map: bankRef → Notion placeholder ID (for archiving on manual link)
  const unmatchedPlaceholderMap: Record<string, string> = {};
  for (const t of unmatchedPlaceholders) {
    if (t.bankReference) unmatchedPlaceholderMap[t.bankReference] = t.id;
  }

  const totalAll     = bankTxns.length;
  const matchedCount = bankTxns.filter((t) => (matchedMap[t.transaction_id] ?? []).length > 0).length;
  const pendingCount = totalAll - matchedCount;

  // Financial totals
  const totalEntradas = bankTxns
    .filter((t) => t.credit_debit === "CRDT")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSaidas = bankTxns
    .filter((t) => t.credit_debit === "DBIT")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const saldo = totalEntradas - totalSaidas;

  function fmtEur(n: number) {
    return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  }

  // Oldest transaction date for the footer
  const oldestDate = bankTxns.length > 0
    ? bankTxns.reduce((min, t) => t.transaction_date < min ? t.transaction_date : min, bankTxns[0].transaction_date)
    : undefined;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin/contabilidade" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
          <Link href="/">
            <Image
              src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME" width={72} height={28} className="object-contain invert"
            />
          </Link>
          <div className="flex-1" />
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Reconciliação</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Financial totals — 2 cols on mobile, Saldo full-width below; 3 cols on md+ */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-base sm:text-lg font-bold text-green-600 tabular-nums">{fmtEur(totalEntradas)}</p>
            <p className="text-xs text-gray-400 mt-1">Total de Entradas</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-base sm:text-lg font-bold text-red-500 tabular-nums">{fmtEur(totalSaidas)}</p>
            <p className="text-xs text-gray-400 mt-1">Total de Saídas</p>
          </div>
          <div className={`col-span-2 md:col-span-1 rounded-2xl border shadow-sm p-4 text-center ${saldo >= 0 ? "bg-white border-gray-100" : "bg-red-50 border-red-100"}`}>
            <p className={`text-base sm:text-lg font-bold tabular-nums ${saldo >= 0 ? "text-[#32373c]" : "text-red-500"}`}>{fmtEur(saldo)}</p>
            <p className="text-xs text-gray-400 mt-1">Saldo</p>
          </div>
        </div>

        {/* Match status KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className="text-xl font-bold text-[#32373c]">{totalAll}</p>
            <p className="text-xs text-gray-400 mt-1 leading-tight">Transações no banco</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className="text-xl font-bold text-green-600">{matchedCount}</p>
            <p className="text-xs text-gray-400 mt-1 leading-tight">Com registo Notion</p>
          </div>
          <div className={`rounded-2xl border shadow-sm p-3 text-center ${pendingCount > 0 ? "bg-orange-50 border-orange-100" : "bg-white border-gray-100"}`}>
            <p className={`text-xl font-bold ${pendingCount > 0 ? "text-orange-500" : "text-gray-400"}`}>{pendingCount}</p>
            <p className="text-xs text-gray-400 mt-1 leading-tight">Sem correspondência</p>
          </div>
        </div>

        {/* Unified ledger */}
        <BankLedger
          bankTxns={bankTxns}
          matchedMap={matchedMap}
          unmatchedPlaceholderMap={unmatchedPlaceholderMap}
          linkableExpenses={linkableExpenses}
          linkableEarnings={linkableEarnings}
          oldestDate={oldestDate}
        />
      </main>
    </div>
  );
}
