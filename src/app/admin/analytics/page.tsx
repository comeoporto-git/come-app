import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getAnalyticsTours, getAnalyticsTransactions, getTeamMembers } from "@/lib/notion";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import Image from "next/image";
import Link from "next/link";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin" && role !== "Super Guide") redirect("/");

  const backHref = role === "Admin" ? "/admin" : "/super-guide";

  // Fetch full history — period filtering happens client-side instantly
  const [tours, transactions, teamMembers] = await Promise.all([
    getAnalyticsTours(),
    getAnalyticsTransactions(),
    getTeamMembers(),
  ]);

  const teamMap = Object.fromEntries(teamMembers.map((m) => [m.id, m.name]));

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={backHref} className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
          <Image
            src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
            alt="COME" width={72} height={28} className="object-contain invert" unoptimized
          />
          <div className="flex-1" />
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Analytics</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-xs text-white/40 hover:text-white transition-colors">Sair</button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <AnalyticsDashboard tours={tours} transactions={transactions} teamMap={teamMap} />
      </main>
    </div>
  );
}
