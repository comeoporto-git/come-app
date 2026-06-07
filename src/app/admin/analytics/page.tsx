import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAnalyticsTours, getAnalyticsTransactions, getTeamMembers, resolvePageTitles } from "@/lib/notion";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin" && session.user.role !== "Super Guide") redirect("/");

  // Fetch full history — period filtering happens client-side instantly
  const [tours, transactions, teamMembers] = await Promise.all([
    getAnalyticsTours(),
    getAnalyticsTransactions(),
    getTeamMembers(),
  ]);

  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));

  // Top clients by booking count
  const clientFreq: Record<string, number> = {};
  for (const t of tours) {
    if (t.client) clientFreq[t.client] = (clientFreq[t.client] ?? 0) + 1;
  }
  const topByBookings = Object.entries(clientFreq)
    .sort(([, a], [, b]) => b - a).slice(0, 20).map(([id]) => id);

  // Top clients by revenue (earnings transactions joined to tours via tourId)
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

  // Resolve names for the union of both lists (max ~40 parallel calls)
  const topClientIds = [...new Set([...topByBookings, ...topByRevenue])];
  const clientNameMap = await resolvePageTitles(topClientIds);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c] overflow-x-hidden">
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
