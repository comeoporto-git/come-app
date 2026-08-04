import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFornecedores, getFornecedorStats, getTotalDespesas } from "@/lib/notion";
import { FornecedoresList } from "@/components/FornecedoresList";

export default async function FornecedoresPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [fornecedores, stats, totalGeral] = await Promise.all([
    getFornecedores(),
    getFornecedorStats(),
    getTotalDespesas(),
  ]);

  const items = fornecedores
    .map((f) => {
      const s = stats.get(f.id) ?? { count: 0, total: 0 };
      return { id: f.id, name: f.name, count: s.count, total: Math.abs(s.total) };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-[#32373c]">Fornecedores</h1>
            <p className="text-xs text-gray-400 mt-0.5">{fornecedores.length} fornecedores registados</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total gasto</p>
            <p className="text-base font-bold text-[#32373c]">{totalGeral.toFixed(2)} €</p>
          </div>
        </div>

        <FornecedoresList items={items} />
      </main>
    </div>
  );
}
