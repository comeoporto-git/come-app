import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getServiceCatalog } from "@/lib/notion";
import { groupByType, formatDuration } from "@/lib/serviceCatalogGrouping";
import Link from "next/link";

export default async function ProdutosServicosPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "Admin" && role !== "Super Guide") redirect("/");

  const services = await getServiceCatalog();
  const groups = groupByType(services);

  return (
    <div className="min-h-screen bg-[#667470] text-[#32373c]">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-white">Produtos & Serviços</h1>
            <p className="text-sm text-white/60">Catálogo de tipos de serviço, preços, passos e restaurantes sugeridos</p>
          </div>
        </div>

        <div className="space-y-6">
          {groups.map(([type, items]) => (
            <section key={type} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#32373c]">{type}</h2>
                <span className="text-xs text-gray-400">{items.length}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td className="p-0">
                        <Link
                          href={`/admin/produtos/${s.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <span className="font-medium text-[#32373c]">{s.name}</span>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-gray-400">{formatDuration(s.durationMinutes)}</span>
                            <span className="text-gray-300">→</span>
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        {services.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-8 text-center text-sm text-gray-400">
            Nenhum serviço configurado ainda.
          </div>
        )}
      </main>
    </div>
  );
}
