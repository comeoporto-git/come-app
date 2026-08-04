import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFornecedores, getFornecedorStats, getTotalDespesas } from "@/lib/notion";
import Link from "next/link";

export default async function FornecedoresPage() {
  const session = await auth();
  if (!session || session.user.role !== "Admin") redirect("/");

  const [fornecedores, stats, totalGeral] = await Promise.all([
    getFornecedores(),
    getFornecedorStats(),
    getTotalDespesas(),
  ]);

  const sorted = [...fornecedores].sort((a, b) => {
    const ta = stats.get(a.id)?.total ?? 0;
    const tb = stats.get(b.id)?.total ?? 0;
    return tb - ta;
  });

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

        {/* List */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {sorted.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              Sem fornecedores registados
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {sorted.map((f) => {
                const s = stats.get(f.id) ?? { count: 0, total: 0 };
                return (
                  <li key={f.id}>
                    <Link
                      href={`/admin/fornecedores/${f.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#667470]/10 flex items-center justify-center text-xs font-bold text-[#667470] flex-shrink-0">
                        {f.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#32373c] truncate">{f.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.count} {s.count === 1 ? "transação" : "transações"}
                        </p>
                      </div>
                      {s.count > 0 && (
                        <p className="text-sm font-semibold text-[#32373c] flex-shrink-0">
                          {Math.abs(s.total).toFixed(2)} €
                        </p>
                      )}
                      <span className="text-gray-300 flex-shrink-0">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
