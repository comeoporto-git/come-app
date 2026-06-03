import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCRMAccounts, getCRMTopClients } from "@/lib/notion";
import Image from "next/image";
import Link from "next/link";
import { PipelineBoard } from "@/components/crm/PipelineBoard";
import { TopClientsLeaderboard } from "@/components/crm/TopClientsLeaderboard";
import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";

export default async function CRMPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [rawAccounts, topClients] = await Promise.all([
    getCRMAccounts(),
    getCRMTopClients(50),
  ]);

  // Merge revenue into accounts and sort Client-stage by revenue desc
  const revenueMap = new Map(topClients.map((c) => [c.id, c.revenue]));
  const accounts = rawAccounts
    .map((a) => ({ ...a, revenue: revenueMap.get(a.id) ?? 0 }))
    .sort((a, b) => {
      if (a.stage === "Client" && b.stage === "Client") return (b.revenue ?? 0) - (a.revenue ?? 0);
      return 0;
    });

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50 font-medium uppercase tracking-widest">CRM</span>
            <Link href="/admin/crm/contacts" className="text-xs text-white/60 hover:text-white transition-colors">Contactos</Link>
            <Link href="/admin/crm/weekly" className="text-xs text-white/60 hover:text-white transition-colors">Semana</Link>
            <Link href="/admin/crm/prospecting" className="text-xs text-white/60 hover:text-white transition-colors">Prospecção</Link>
          </div>
        </div>
      </header>

      <CRMBreadcrumb crumbs={[{ label: "CRM" }]} />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <PipelineBoard accounts={accounts} />
        <TopClientsLeaderboard clients={topClients} />
      </main>
    </div>
  );
}
