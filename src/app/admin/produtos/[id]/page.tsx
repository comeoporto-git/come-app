import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getServiceDetail } from "@/lib/notion";
import { ServiceCatalogDetail } from "@/components/ServiceCatalogDetail";
import Link from "next/link";

export default async function ProdutoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin" && role !== "Super Guide") redirect("/");

  const { id } = await params;
  const service = await getServiceDetail(id);
  if (!service) notFound();

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/admin/produtos" className="text-sm text-white/70 hover:text-white transition-colors">← Produtos & Serviços</Link>
        <h1 className="text-lg font-bold text-white mt-2 mb-6">{service.name}</h1>
        <ServiceCatalogDetail service={service} canEdit={role === "Admin"} showAdminSections={role === "Admin"} />
      </main>
    </div>
  );
}
