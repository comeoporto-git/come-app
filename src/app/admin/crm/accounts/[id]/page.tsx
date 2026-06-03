import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getCRMAccountById, getCRMActivities, getCRMAccountStats, getClientSales } from "@/lib/notion";
import { getCRMContactEmails } from "@/lib/integration";
import type { EmailMessage } from "@/lib/integration";
import Image from "next/image";
import Link from "next/link";
import { AccountDetailClient } from "@/components/crm/AccountDetailClient";
import { AccountStatsPanel } from "@/components/crm/AccountStatsPanel";
import { ClientSalesKanban } from "@/components/crm/ClientSalesKanban";
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

  // Fetch emails for all contacts that have an email address
  const contacts = account.contacts ?? [];
  const emailsPerContact: Record<string, EmailMessage[]> = {};
  await Promise.all(
    contacts
      .filter((c) => c.email)
      .map(async (c) => {
        emailsPerContact[c.id] = await getCRMContactEmails(c.email!);
      })
  );

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <header className="bg-[#7b8b87] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/crm" className="text-white/40 hover:text-white transition-colors text-lg leading-none">←</Link>
            <Link href="/">
              <Image
                src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
                alt="COME" width={72} height={28}
                className="object-contain invert"
              />
            </Link>
          </div>
          <span className="text-xs text-white/50 font-medium uppercase tracking-widest truncate max-w-[200px]">{account.name}</span>
        </div>
      </header>

      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: account.name }]} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <AccountDetailClient account={account} activities={activities} emailsPerContact={emailsPerContact} />
        <ClientSalesKanban sales={sales} />
        <AccountStatsPanel stats={stats} />
      </main>
    </div>
  );
}
