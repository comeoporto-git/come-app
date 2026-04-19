import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import {
  getUnmatchedBankTransactions,
  getMatchedTransactionMap,
  getLinkableExpenses,
  getLinkableEarnings,
} from "@/lib/notion";
import { getStoredTransactions } from "@/lib/enablebanking";
import { BankLedger } from "@/components/BankLedger";
import Image from "next/image";
import Link from "next/link";

export default async function ReconciliationPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  // Fetch all data in parallel — individual failures return empty defaults
  const [bankTxns, matchedMap, unmatchedPlaceholders, linkableExpenses, linkableEarnings] = await Promise.all([
    getStoredTransactions(0).catch((e) => { console.error("[reconciliation] bankTxns:", e); return []; }),
    getMatchedTransactionMap(),
    getUnmatchedBankTransactions().catch((e) => { console.error("[reconciliation] unmatched:", e); return []; }),
    getLinkableExpenses(),
    getLinkableEarnings(),
  ]);

  // Build a map: bankRef → Notion placeholder ID (for archiving on manual link)
  const unmatchedPlaceholderMap: Record<string, string> = {};
  for (const t of unmatchedPlaceholders) {
    if (t.bankReference) unmatchedPlaceholderMap[t.bankReference] = t.id;
  }

  const totalAll     = bankTxns.length;
  const matchedCount = bankTxns.filter((t) => !!matchedMap[t.transaction_id]).length;
  const pendingCount = totalAll - matchedCount;

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
              alt="COME" width={72} height={28} className="object-contain invert" unoptimized
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

        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-[#32373c]">{totalAll}</p>
            <p className="text-xs text-gray-400 mt-1">Transações no banco</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{matchedCount}</p>
            <p className="text-xs text-gray-400 mt-1">Com registo Notion</p>
          </div>
          <div className={`rounded-2xl border shadow-sm p-4 text-center ${pendingCount > 0 ? "bg-orange-50 border-orange-100" : "bg-white border-gray-100"}`}>
            <p className={`text-2xl font-bold ${pendingCount > 0 ? "text-orange-500" : "text-gray-400"}`}>{pendingCount}</p>
            <p className="text-xs text-gray-400 mt-1">Sem correspondência</p>
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
