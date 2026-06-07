import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getAnalyticsTours, getAnalyticsTransactions, getTeamMembers, resolvePageTitles } from "@/lib/notion";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import Image from "next/image";
import Link from "next/link";

export default async function SuperGuideAnalyticsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Super Guide" && session.user.role !== "Admin") redirect("/");

  const [tours, transactions, teamMembers] = await Promise.all([
    getAnalyticsTours(),
    getAnalyticsTransactions(),
    getTeamMembers(),
  ]);

  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));

  const clientFreq: Record<string, number> = {};
  for (const t of tours) {
    if (t.client) clientFreq[t.client] = (clientFreq[t.client] ?? 0) + 1;
  }
  const topByBookings = Object.entries(clientFreq)
    .sort(([, a], [, b]) => b - a).slice(0, 20).map(([id]) => id);

  const tourClientMap: Record<string, string> = {};
  for (const t of tours) { if (t.id && t.client) tourClientMap[t.id] = t.client; }
  const clientRevenue: Record<string, number> = {};
  for (const tx of transactions) {
    if (!tx.supplier.startsWith("IN -") || !tx.tourId) continue;
    const cid = tourClientMap[tx.tourId];
    if (!cid) continue;
    clientRevenue[cid] = (clientRevenue[cid] ?? 0) + tx.totalCost;
  }
  const topByRevenue = Object.entries(clientRevenue)
    .sort(([, a], [, b]) => b - a).slice(0, 20).map(([id]) => id);

  const topClientIds = [...new Set([...topByBookings, ...topByRevenue])];
  const clientNameMap = await resolvePageTitles(topClientIds);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c] overflow-x-hidden">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/super-guide" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
          <Link href="/">
            <Image
              src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
              alt="COME" width={72} height={28} className="object-contain invert"
            />
          </Link>
          <div className="flex-1" />
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Analytics</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <AnalyticsDashboard
          tours={tours}
          transactions={transactions}
          teamMap={teamMap}
          clientNameMap={clientNameMap}
        />
      </main>
    </div>
  );
}
