import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupplierItems } from "@/lib/eventQuotesData";
import { getFornecedores } from "@/lib/notion";
import { PriceCatalog } from "@/components/quotes/PriceCatalog";

export default async function PrecosFornecedoresPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "Admin") redirect("/");

  const [items, fornecedores] = await Promise.all([getSupplierItems(), getFornecedores()]);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/admin/orcamentos" className="text-sm text-white/70 hover:text-white transition-colors">← Orçamentos</Link>
          <h1 className="text-xl font-bold text-white mt-2">Preços de fornecedores</h1>
          <p className="text-sm text-white/60">Aluguer de material para eventos, sem IVA. Cada preço novo fica no histórico.</p>
        </div>
        <PriceCatalog items={items} fornecedores={fornecedores.map((f) => ({ id: f.id, name: f.name, categoria: f.categoria ?? null }))} />
      </main>
    </div>
  );
}
