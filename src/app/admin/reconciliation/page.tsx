import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getUnmatchedBankTransactions,
  getMatchedTransactionMap,
  getLinkableTransactions,
} from "@/lib/notion";
import { getStoredTransactions } from "@/lib/enablebanking";
import { BankLedger } from "@/components/BankLedger";

export default async function ReconciliationPage() {
  const session = await auth();
  if (!session || (session.user.role !== "Admin" && session.user.role !== "Accountant")) redirect("/");

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

  // Oldest transaction date for the footer
  const oldestDate = bankTxns.length > 0
    ? bankTxns.reduce((min, t) => t.transaction_date < min ? t.transaction_date : min, bankTxns[0].transaction_date)
    : undefined;

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

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
