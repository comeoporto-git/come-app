import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getCRMAccountById, getCRMActivities, getCRMAccountStats, getClientSales } from "@/lib/notion";
import { getCRMContactEmails } from "@/lib/integration";
import type { EmailMessage } from "@/lib/integration";
import { AccountDetailClient } from "@/components/crm/AccountDetailClient";
import { AccountStatsPanel } from "@/components/crm/AccountStatsPanel";
import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const { id } = await params;
  const [account, activities, stats, sales] = await Promise.all([
    getCRMAccountById(id),
    getCRMActivities(id),
    getCRMAccountStats(id),
    getClientSales(id),
  ]);
  if (!account) notFound();

  const contacts = account.contacts ?? [];
  const emailsPerContact: Record<string, EmailMessage[]> = {};
  await Promise.all(
    contacts
      .filter((c) => c.email)
      .map(async (c) => {
        emailsPerContact[c.id] = await getCRMContactEmails(c.email!);
      })
  );

  const isClient = account.stage === "Client";

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: account.name }]} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Client layout: Contactos | Histórico de Vendas, then Kanban, then Atividade
            Other layout:  Contactos | Atividade */}
        <AccountDetailClient
          account={account}
          activities={activities}
          emailsPerContact={emailsPerContact}
          stats={isClient ? stats : undefined}
          sales={isClient ? sales : undefined}
        />

        {/* Non-client accounts: show stats panel below if they have booking history */}
        {!isClient && stats.totalBookings > 0 && <AccountStatsPanel stats={stats} />}
      </main>
    </div>
  );
}
