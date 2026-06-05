import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProspectingClient } from "@/components/crm/ProspectingClient";
import { CRMBreadcrumb } from "@/components/crm/CRMBreadcrumb";

export default async function ProspectingPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <CRMBreadcrumb crumbs={[{ label: "CRM", href: "/admin/crm" }, { label: "Prospecção IA" }]} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <ProspectingClient />
      </main>
    </div>
  );
}
