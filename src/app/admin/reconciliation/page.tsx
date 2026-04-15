import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUnmatchedBankTransactions, getFlaggedTransactions } from "@/lib/notion";
import Link from "next/link";
import { ReconciliationPanel } from "@/components/ReconciliationPanel";

export default async function ReconciliationPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [unmatched, flagged] = await Promise.all([
    getUnmatchedBankTransactions(),
    getFlaggedTransactions(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="text-gray-400 hover:text-gray-700">←</Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">Reconciliação Bancária</h1>
            <p className="text-xs text-gray-400">
              {unmatched.length + flagged.length === 0
                ? "Tudo reconciliado ✓"
                : `${unmatched.length + flagged.length} item${unmatched.length + flagged.length !== 1 ? "s" : ""} para rever`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        <ReconciliationPanel unmatched={unmatched} flagged={flagged} />
      </main>
    </div>
  );
}
